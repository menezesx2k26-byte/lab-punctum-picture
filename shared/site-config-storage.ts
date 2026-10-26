import {
  BACKGROUND_ASSET_REGISTRY,
  PUNCTUM_DEFAULT_SITE_CONFIG,
  applySitePreset,
  refreshLegacyPublishedConfig,
  safeParseSiteConfig,
  siteConfigSchema,
  type SiteConfig,
  type SitePresetId,
} from "./config";
import {
  readPublishedImagesById,
  readPublicSiteSettings,
  type PublicSiteSettings,
} from "./public-content";

const MAX_SITE_CONFIG_BYTES = 32_768;
export const SITE_CONFIG_HISTORY_RETENTION = 25;

type LegacySiteConfigRow = {
  schemaVersion: number;
  configJson: string;
  updatedAt: string;
  updatedBy: string;
};

type VersionRow = {
  id: string;
  schemaVersion: number;
  state: "draft" | "published";
  revision: number;
  configJson: string;
  basedOnVersionId: string | null;
  restoredFromVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
  publishedBy: string | null;
};

type PointerRow = {
  draftVersionId: string;
  publishedVersionId: string;
};

export type PublicSiteConfigState = {
  config: SiteConfig;
  versionId: string | null;
  source:
    | "published"
    | "migrated-v3"
    | "migrated-v2"
    | "migrated-v1"
    | "legacy-bootstrap"
    | "safe-fallback";
  issues: readonly string[];
  updatedAt: string | null;
};

export type DraftSiteConfigState = {
  config: SiteConfig;
  versionId: string;
  revision: number;
  basedOnVersionId: string | null;
  publishedVersionId: string;
  hasUnpublishedChanges: boolean;
  source: PublicSiteConfigState["source"] | "draft";
  issues: readonly string[];
  updatedAt: string;
  updatedBy: string;
};

export type PublishedVersionSummary = {
  id: string;
  publishedAt: string;
  publishedBy: string;
  restoredFromVersionId: string | null;
  isCurrent: boolean;
};

export class DraftRevisionConflictError extends Error {
  constructor() {
    super("O Studio foi alterado em outra aba.");
    this.name = "DraftRevisionConflictError";
  }
}

export class PublishedVersionNotFoundError extends Error {
  constructor() {
    super("Essa versão anterior não está mais disponível.");
    this.name = "PublishedVersionNotFoundError";
  }
}

export class InvalidStoredSiteConfigError extends Error {
  constructor(message = "Essa versão não pode ser usada com segurança.") {
    super(message);
    this.name = "InvalidStoredSiteConfigError";
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function resultChanges(result: D1Result<unknown> | undefined): number {
  return Number(result?.meta?.changes ?? 0);
}

function parseStoredConfig(
  configJson: string,
  fallbackSettings: Pick<PublicSiteSettings, "aboutText" | "tagline">,
): Omit<PublicSiteConfigState, "updatedAt" | "versionId"> {
  if (byteLength(configJson) > MAX_SITE_CONFIG_BYTES) {
    return {
      config: siteConfigFromLegacySettings(fallbackSettings),
      source: "safe-fallback",
      issues: ["Configuração persistida acima do limite permitido."],
    };
  }

  let input: unknown;
  try {
    input = JSON.parse(configJson);
  } catch {
    return {
      config: siteConfigFromLegacySettings(fallbackSettings),
      source: "safe-fallback",
      issues: ["Configuração persistida não contém JSON válido."],
    };
  }

  const parsed = safeParseSiteConfig(input);
  const refreshedConfig = refreshLegacyPublishedConfig(parsed.config);
  if (parsed.source === "punctum-default") {
    return {
      config: siteConfigFromLegacySettings(fallbackSettings),
      source: "safe-fallback",
      issues: parsed.issues,
    };
  }
  if (parsed.source === "migrated-v1") {
    return {
      config: refreshLegacyPublishedConfig(
        siteConfigWithLegacySettings(refreshedConfig, fallbackSettings),
      ),
      source: "migrated-v1",
      issues: parsed.issues,
    };
  }
  if (parsed.source === "migrated-v2") {
    return {
      config: refreshedConfig,
      source: "migrated-v2",
      issues: parsed.issues,
    };
  }
  if (parsed.source === "migrated-v3") {
    return {
      config: refreshedConfig,
      source: "migrated-v3",
      issues: parsed.issues,
    };
  }
  return { config: refreshedConfig, source: "published", issues: [] };
}

async function readPointers(db: D1Database): Promise<PointerRow | null> {
  return db
    .prepare(
      `SELECT draft_version_id AS draftVersionId,
        published_version_id AS publishedVersionId
       FROM site_config_pointers WHERE id = 1`,
    )
    .first<PointerRow>();
}

async function readVersion(db: D1Database, id: string): Promise<VersionRow | null> {
  return db
    .prepare(
      `SELECT id, schema_version AS schemaVersion, state, revision,
        config_json AS configJson, based_on_version_id AS basedOnVersionId,
        restored_from_version_id AS restoredFromVersionId,
        created_at AS createdAt, updated_at AS updatedAt,
        published_at AS publishedAt, created_by AS createdBy,
        updated_by AS updatedBy, published_by AS publishedBy
       FROM site_config_versions WHERE id = ?`,
    )
    .bind(id)
    .first<VersionRow>();
}

async function ensureVersionedSiteConfig(
  db: D1Database,
  settings: PublicSiteSettings,
): Promise<{ pointers: PointerRow; bootstrapIssues: readonly string[] }> {
  const existing = await readPointers(db);
  if (existing) return { pointers: existing, bootstrapIssues: [] };

  const legacy = await db
    .prepare(
      `SELECT schema_version AS schemaVersion, config_json AS configJson,
        updated_at AS updatedAt, updated_by AS updatedBy
       FROM site_config WHERE id = 1`,
    )
    .first<LegacySiteConfigRow>();
  const parsed = legacy
    ? parseStoredConfig(legacy.configJson, settings)
    : {
        config: siteConfigFromLegacySettings(settings),
        source: "legacy-bootstrap" as const,
        issues: [] as readonly string[],
      };
  const serialized = serializeSiteConfig(parsed.config);
  const now = legacy?.updatedAt ?? new Date().toISOString();
  const actor = legacy?.updatedBy ?? "system-bootstrap";

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO site_config_versions (
          id, schema_version, state, revision, config_json,
          based_on_version_id, restored_from_version_id,
          created_at, updated_at, published_at,
          created_by, updated_by, published_by
        ) VALUES (?, ?, 'published', 1, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        "site-published-initial",
        parsed.config.schemaVersion,
        serialized,
        now,
        now,
        now,
        actor,
        actor,
        actor,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO site_config_versions (
          id, schema_version, state, revision, config_json,
          based_on_version_id, restored_from_version_id,
          created_at, updated_at, published_at,
          created_by, updated_by, published_by
        ) VALUES (?, ?, 'draft', 1, ?, ?, NULL, ?, ?, NULL, ?, ?, NULL)`,
      )
      .bind(
        "site-draft-current",
        parsed.config.schemaVersion,
        serialized,
        "site-published-initial",
        now,
        now,
        actor,
        actor,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO site_config_pointers (
          id, draft_version_id, published_version_id, updated_at
        ) VALUES (1, ?, ?, ?)`,
      )
      .bind("site-draft-current", "site-published-initial", now),
  ]);

  const pointers = await readPointers(db);
  if (!pointers) {
    throw new Error("Não foi possível preparar a configuração versionada do site.");
  }
  return { pointers, bootstrapIssues: parsed.issues };
}

export function siteConfigWithLegacySettings(
  config: SiteConfig,
  settings: Pick<PublicSiteSettings, "aboutText" | "tagline">,
): SiteConfig {
  return siteConfigSchema.parse({
    ...config,
    editorial: {
      ...config.editorial,
      home: {
        ...config.editorial.home,
        about: { ...config.editorial.home.about, body: settings.aboutText },
      },
      chrome: {
        ...config.editorial.chrome,
        footer: { ...config.editorial.chrome.footer, tagline: settings.tagline },
      },
    },
  });
}

export function siteConfigFromLegacySettings(
  settings: Pick<PublicSiteSettings, "aboutText" | "tagline">,
): SiteConfig {
  return siteConfigWithLegacySettings(PUNCTUM_DEFAULT_SITE_CONFIG, settings);
}

export function serializeSiteConfig(config: SiteConfig): string {
  const serialized = JSON.stringify(siteConfigSchema.parse(config));
  if (byteLength(serialized) > MAX_SITE_CONFIG_BYTES) {
    throw new Error("A configuração do site ficou grande demais para ser salva.");
  }
  return serialized;
}

export async function assertSiteConfigReferences(
  db: D1Database,
  config: SiteConfig,
): Promise<void> {
  const assetId = config.theme.background.assetId;
  if (assetId && !Object.hasOwn(BACKGROUND_ASSET_REGISTRY, assetId)) {
    throw new InvalidStoredSiteConfigError(
      "O fundo escolhido não está mais disponível para publicação.",
    );
  }
  const imageIds = new Set<string>();
  if (config.theme.background.imageId) imageIds.add(config.theme.background.imageId);
  for (const section of config.pages.home.sections) {
    if (section.appearance.backgroundImageId) {
      imageIds.add(section.appearance.backgroundImageId);
    }
    if (section.type === "photo-reel") {
      section.photoIds.forEach((imageId) => imageIds.add(imageId));
    }
  }
  if (!imageIds.size) return;
  const available = await readPublishedImagesById(db, [...imageIds]);
  if (available.length !== imageIds.size) {
    throw new InvalidStoredSiteConfigError(
      "Uma das fotografias escolhidas não está mais publicada.",
    );
  }
}

export async function readPublicSiteConfigState(
  db: D1Database,
  settings?: PublicSiteSettings,
): Promise<PublicSiteConfigState> {
  const publicSettings = settings ?? (await readPublicSiteSettings(db));
  const { pointers, bootstrapIssues } = await ensureVersionedSiteConfig(db, publicSettings);
  const row = await readVersion(db, pointers.publishedVersionId);
  if (!row || row.state !== "published") {
    return {
      config: siteConfigFromLegacySettings(publicSettings),
      versionId: null,
      source: "safe-fallback",
      issues: ["A versão publicada não foi encontrada."],
      updatedAt: null,
    };
  }
  const parsed = parseStoredConfig(row.configJson, publicSettings);
  return {
    ...parsed,
    versionId: row.id,
    source:
      parsed.source === "published" && bootstrapIssues.length
        ? "legacy-bootstrap"
        : parsed.source,
    issues: [...bootstrapIssues, ...parsed.issues],
    updatedAt: row.updatedAt,
  };
}

export async function readPublicSiteConfig(
  db: D1Database,
  settings?: PublicSiteSettings,
): Promise<SiteConfig> {
  return (await readPublicSiteConfigState(db, settings)).config;
}

export async function readDraftSiteConfigState(
  db: D1Database,
  settings?: PublicSiteSettings,
): Promise<DraftSiteConfigState> {
  const publicSettings = settings ?? (await readPublicSiteSettings(db));
  const { pointers, bootstrapIssues } = await ensureVersionedSiteConfig(db, publicSettings);
  const [draft, published] = await Promise.all([
    readVersion(db, pointers.draftVersionId),
    readVersion(db, pointers.publishedVersionId),
  ]);
  if (!draft || draft.state !== "draft" || !published || published.state !== "published") {
    throw new InvalidStoredSiteConfigError(
      "O Studio não encontrou uma versão segura para editar.",
    );
  }
  const draftParsed = parseStoredConfig(draft.configJson, publicSettings);
  const publishedParsed = parseStoredConfig(published.configJson, publicSettings);
  if (draftParsed.source === "safe-fallback") {
    throw new InvalidStoredSiteConfigError(
      "As alterações salvas precisam ser recuperadas antes de continuar.",
    );
  }
  return {
    config: draftParsed.config,
    versionId: draft.id,
    revision: draft.revision,
    basedOnVersionId: draft.basedOnVersionId,
    publishedVersionId: published.id,
    hasUnpublishedChanges:
      serializeSiteConfig(draftParsed.config) !== serializeSiteConfig(publishedParsed.config),
    source: draftParsed.source === "published" ? "draft" : draftParsed.source,
    issues: [...bootstrapIssues, ...draftParsed.issues],
    updatedAt: draft.updatedAt,
    updatedBy: draft.updatedBy,
  };
}

export async function saveDraftSiteConfig(
  db: D1Database,
  config: SiteConfig,
  expectedRevision: number,
  actor: string,
): Promise<DraftSiteConfigState> {
  const settings = await readPublicSiteSettings(db);
  const { pointers } = await ensureVersionedSiteConfig(db, settings);
  const parsed = siteConfigSchema.parse(config);
  await assertSiteConfigReferences(db, parsed);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE site_config_versions
       SET schema_version = ?, config_json = ?, revision = revision + 1,
           updated_at = ?, updated_by = ?
       WHERE id = ? AND state = 'draft' AND revision = ?`,
    )
    .bind(
      parsed.schemaVersion,
      serializeSiteConfig(parsed),
      now,
      actor,
      pointers.draftVersionId,
      expectedRevision,
    )
    .run();
  if (!resultChanges(result)) throw new DraftRevisionConflictError();
  return readDraftSiteConfigState(db, settings);
}

export async function discardDraftSiteConfig(
  db: D1Database,
  expectedRevision: number,
  actor: string,
): Promise<DraftSiteConfigState> {
  const settings = await readPublicSiteSettings(db);
  const { pointers } = await ensureVersionedSiteConfig(db, settings);
  const published = await readVersion(db, pointers.publishedVersionId);
  if (!published || published.state !== "published") throw new InvalidStoredSiteConfigError();
  const parsed = parseStoredConfig(published.configJson, settings);
  if (parsed.source === "safe-fallback") throw new InvalidStoredSiteConfigError();
  const now = new Date().toISOString();
  const auditId = crypto.randomUUID();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE site_config_versions
         SET schema_version = ?, config_json = ?, revision = revision + 1,
             based_on_version_id = ?, restored_from_version_id = NULL,
             updated_at = ?, updated_by = ?
         WHERE id = ? AND state = 'draft' AND revision = ?`,
      )
      .bind(
        parsed.config.schemaVersion,
        serializeSiteConfig(parsed.config),
        published.id,
        now,
        actor,
        pointers.draftVersionId,
        expectedRevision,
      ),
    db
      .prepare(
        `INSERT INTO audit_log (
          id, actor_email, action, entity_type, entity_id, data_json, created_at
        ) SELECT ?, ?, 'studio.draft_discarded', 'site_config', ?, NULL, ?
          WHERE EXISTS (
            SELECT 1 FROM site_config_versions WHERE id = ? AND revision = ?
          )`,
      )
      .bind(
        auditId,
        actor,
        pointers.draftVersionId,
        now,
        pointers.draftVersionId,
        expectedRevision + 1,
      ),
  ]);
  if (!resultChanges(results[0])) throw new DraftRevisionConflictError();
  return readDraftSiteConfigState(db, settings);
}

async function publishConfigSnapshot(
  db: D1Database,
  config: SiteConfig,
  expectedRevision: number,
  actor: string,
  restoredFromVersionId: string | null,
): Promise<DraftSiteConfigState> {
  const settings = await readPublicSiteSettings(db);
  const { pointers } = await ensureVersionedSiteConfig(db, settings);
  const parsed = siteConfigSchema.parse(config);
  await assertSiteConfigReferences(db, parsed);
  const configJson = serializeSiteConfig(parsed);
  const publishedId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();
  const editorial = parsed.editorial;

  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO site_config_versions (
          id, schema_version, state, revision, config_json,
          based_on_version_id, restored_from_version_id,
          created_at, updated_at, published_at,
          created_by, updated_by, published_by
        )
        SELECT ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM site_config_pointers p
          INNER JOIN site_config_versions d ON d.id = p.draft_version_id
          WHERE p.id = 1 AND p.draft_version_id = ?
            AND p.published_version_id = ? AND d.revision = ?
            AND d.state = 'draft'
        )`,
      )
      .bind(
        publishedId,
        parsed.schemaVersion,
        expectedRevision,
        configJson,
        pointers.publishedVersionId,
        restoredFromVersionId,
        now,
        now,
        now,
        actor,
        actor,
        actor,
        pointers.draftVersionId,
        pointers.publishedVersionId,
        expectedRevision,
      ),
    db
      .prepare(
        `UPDATE site_config_pointers SET published_version_id = ?, updated_at = ?
         WHERE id = 1 AND draft_version_id = ? AND published_version_id = ?
           AND EXISTS (SELECT 1 FROM site_config_versions WHERE id = ?)`,
      )
      .bind(
        publishedId,
        now,
        pointers.draftVersionId,
        pointers.publishedVersionId,
        publishedId,
      ),
    db
      .prepare(
        `UPDATE site_config_versions
         SET schema_version = ?, config_json = ?, revision = revision + 1,
             based_on_version_id = ?, restored_from_version_id = NULL,
             updated_at = ?, updated_by = ?
         WHERE id = ? AND state = 'draft' AND revision = ?
           AND EXISTS (
             SELECT 1 FROM site_config_pointers
             WHERE id = 1 AND published_version_id = ?
           )`,
      )
      .bind(
        parsed.schemaVersion,
        configJson,
        publishedId,
        now,
        actor,
        pointers.draftVersionId,
        expectedRevision,
        publishedId,
      ),
    db
      .prepare(
        `INSERT INTO site_settings (
          id, brand_name, tagline, about_text, whatsapp_e164, whatsapp_message,
          instagram_url, contact_email, seo_title, seo_description, updated_at
        )
        SELECT 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM site_config_pointers
          WHERE id = 1 AND published_version_id = ?
        )
        ON CONFLICT(id) DO UPDATE SET
          tagline = excluded.tagline,
          about_text = excluded.about_text,
          updated_at = excluded.updated_at`,
      )
      .bind(
        settings.brandName,
        editorial.chrome.footer.tagline,
        editorial.home.about.body,
        settings.whatsappE164,
        settings.whatsappMessage,
        settings.instagramUrl,
        settings.contactEmail,
        settings.seoTitle,
        settings.seoDescription,
        now,
        publishedId,
      ),
    db
      .prepare(
        `INSERT INTO audit_log (
          id, actor_email, action, entity_type, entity_id, data_json, created_at
        ) SELECT ?, ?, ?, 'site_config', ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM site_config_pointers
            WHERE id = 1 AND published_version_id = ?
          )`,
      )
      .bind(
        auditId,
        actor,
        restoredFromVersionId ? "studio.version_restored" : "studio.published",
        publishedId,
        JSON.stringify({
          schemaVersion: parsed.schemaVersion,
          basedOnVersionId: pointers.publishedVersionId,
          restoredFromVersionId,
        }),
        now,
        publishedId,
      ),
    db.prepare(
      `DELETE FROM site_config_versions
       WHERE state = 'published'
         AND id NOT IN (
           SELECT id FROM site_config_versions
           WHERE state = 'published'
           ORDER BY published_at DESC, created_at DESC
           LIMIT ${SITE_CONFIG_HISTORY_RETENTION}
         )
         AND id NOT IN (
           SELECT published_version_id FROM site_config_pointers WHERE id = 1
         )`,
    ),
  ]);

  if (!resultChanges(results[0]) || !resultChanges(results[1]) || !resultChanges(results[2])) {
    throw new DraftRevisionConflictError();
  }
  return readDraftSiteConfigState(db, settings);
}

export async function publishDraftSiteConfig(
  db: D1Database,
  expectedRevision: number,
  actor: string,
): Promise<DraftSiteConfigState> {
  const draft = await readDraftSiteConfigState(db);
  if (draft.revision !== expectedRevision) throw new DraftRevisionConflictError();
  return publishConfigSnapshot(db, draft.config, expectedRevision, actor, null);
}

/**
 * Publish only the visual variant of the current published site, leaving the
 * pending Studio draft untouched (including its revision and content).
 */
export async function publishVisualPresetPreservingDraft(
  db: D1Database,
  presetId: SitePresetId,
  expectedPublishedVersionId: string,
  expectedDraftRevision: number,
  actor: string,
): Promise<{ previousVersionId: string; publishedVersionId: string; draftRevision: number }> {
  const settings = await readPublicSiteSettings(db);
  const { pointers } = await ensureVersionedSiteConfig(db, settings);
  if (pointers.publishedVersionId !== expectedPublishedVersionId) {
    throw new DraftRevisionConflictError();
  }
  const [published, draft] = await Promise.all([
    readVersion(db, pointers.publishedVersionId),
    readVersion(db, pointers.draftVersionId),
  ]);
  if (!published || published.state !== "published" || !draft || draft.state !== "draft") {
    throw new InvalidStoredSiteConfigError();
  }
  if (draft.revision !== expectedDraftRevision) throw new DraftRevisionConflictError();
  const parsed = parseStoredConfig(published.configJson, settings);
  if (parsed.source === "safe-fallback") throw new InvalidStoredSiteConfigError();
  const original = parsed.config;
  const candidate = applySitePreset(original, presetId);
  const normalized = structuredClone(candidate);
  normalized.identity = structuredClone(original.identity);
  normalized.theme = structuredClone(original.theme);
  if (normalized.pages.home.sections.length !== original.pages.home.sections.length) {
    throw new InvalidStoredSiteConfigError("O preset altera a estrutura da página.");
  }
  for (const [index, item] of normalized.pages.home.sections.entries()) {
    const previous = original.pages.home.sections[index];
    if (item.id !== previous.id || item.type !== previous.type) {
      throw new InvalidStoredSiteConfigError("O preset altera a identidade das seções.");
    }
    item.variant = previous.variant;
  }
  if (serializeSiteConfig(normalized) !== serializeSiteConfig(original)) {
    throw new InvalidStoredSiteConfigError("O preset tenta modificar conteúdo não visual.");
  }
  await assertSiteConfigReferences(db, candidate);

  const publishedVersionId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(
      `INSERT INTO site_config_versions (
         id, schema_version, state, revision, config_json,
         based_on_version_id, restored_from_version_id,
         created_at, updated_at, published_at,
         created_by, updated_by, published_by
       ) SELECT ?, ?, 'published', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM site_config_pointers p
             JOIN site_config_versions d ON d.id = p.draft_version_id
           WHERE p.id = 1 AND p.published_version_id = ?
             AND p.draft_version_id = ? AND d.state = 'draft'
             AND d.revision = ?
         )`,
    ).bind(
      publishedVersionId, candidate.schemaVersion, published.revision + 1,
      serializeSiteConfig(candidate), published.id,
      now, now, now, actor, actor, actor,
      published.id, draft.id, expectedDraftRevision,
    ),
    db.prepare(
      `UPDATE site_config_pointers
       SET published_version_id = ?, updated_at = ?
       WHERE id = 1 AND published_version_id = ? AND draft_version_id = ?
         AND EXISTS (
           SELECT 1 FROM site_config_versions d
           WHERE d.id = ? AND d.state = 'draft' AND d.revision = ?
         )
         AND EXISTS (
           SELECT 1 FROM site_config_versions p
           WHERE p.id = ? AND p.state = 'published'
         )`,
    ).bind(
      publishedVersionId, now, published.id, draft.id,
      draft.id, expectedDraftRevision, publishedVersionId,
    ),
    db.prepare(
      `INSERT INTO audit_log (
         id, actor_email, action, entity_type, entity_id, data_json, created_at
       ) SELECT ?, ?, 'studio.visual_preset_published', 'site_config', ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM site_config_pointers WHERE id = 1 AND published_version_id = ?
         )`,
    ).bind(
      auditId, actor, publishedVersionId,
      JSON.stringify({ presetId, previousVersionId: published.id, preservedDraftVersionId: draft.id }),
      now, publishedVersionId,
    ),
  ]);
  if (!resultChanges(results[0]) || !resultChanges(results[1]) || !resultChanges(results[2])) {
    throw new DraftRevisionConflictError();
  }
  return { previousVersionId: published.id, publishedVersionId, draftRevision: expectedDraftRevision };
}

export async function restorePublishedSiteConfig(
  db: D1Database,
  versionId: string,
  expectedRevision: number,
  actor: string,
): Promise<DraftSiteConfigState> {
  const settings = await readPublicSiteSettings(db);
  const target = await readVersion(db, versionId);
  if (!target || target.state !== "published") throw new PublishedVersionNotFoundError();
  const parsed = parseStoredConfig(target.configJson, settings);
  if (parsed.source === "safe-fallback") throw new InvalidStoredSiteConfigError();
  return publishConfigSnapshot(db, parsed.config, expectedRevision, actor, target.id);
}

export async function listPublishedSiteConfigVersions(
  db: D1Database,
  limit = 10,
): Promise<PublishedVersionSummary[]> {
  const settings = await readPublicSiteSettings(db);
  const { pointers } = await ensureVersionedSiteConfig(db, settings);
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), SITE_CONFIG_HISTORY_RETENTION);
  const result = await db
    .prepare(
      `SELECT id, published_at AS publishedAt, published_by AS publishedBy,
        restored_from_version_id AS restoredFromVersionId
       FROM site_config_versions
       WHERE state = 'published' AND published_at IS NOT NULL
       ORDER BY published_at DESC, created_at DESC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all<{
      id: string;
      publishedAt: string;
      publishedBy: string;
      restoredFromVersionId: string | null;
    }>();
  return result.results.map((row) => ({
    ...row,
    isCurrent: row.id === pointers.publishedVersionId,
  }));
}
