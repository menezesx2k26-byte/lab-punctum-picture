import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import initMigration from "../../migrations/0001_init.sql?raw";
import settingsSeed from "../../migrations/0002_seed_settings.sql?raw";
import operationsMigration from "../../migrations/0003_operations.sql?raw";
import whatsappMigration from "../../migrations/0004_whatsapp_contact.sql?raw";
import foundationMigration from "../../migrations/0005_foundation_reconcile.sql?raw";
import editorialMigration from "../../migrations/0006_editorial_personality.sql?raw";
import versionedConfigMigration from "../../migrations/0007_site_config_versions.sql?raw";
import {
  PUNCTUM_DEFAULT_SITE_CONFIG,
  applyFontPair,
} from "../../shared/config";

async function applySql(sql: string) {
  if (!env.DB) throw new Error("Binding DB ausente no teste");
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

function jsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost:8787${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:8787",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Worker Punctum Picture", () => {
  beforeAll(async () => {
    await applySql(initMigration);
    await applySql(settingsSeed);
    await applySql(operationsMigration);
    await applySql(whatsappMigration);
    await applySql(foundationMigration);
    await applySql(editorialMigration);
    await applySql(versionedConfigMigration);
  });

  it("responde o health check e dados públicos", async () => {
    const health = await exports.default.fetch("http://localhost:8787/api/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, service: "punctum-picture" });

    const site = await exports.default.fetch("http://localhost:8787/api/public/site");
    expect(site.status).toBe(200);
    expect(await site.json()).toMatchObject({
      site: { brandName: "Punctum Picture" },
    });
  });

  it("propaga settings administrativas para a API pública", async () => {
    const update = await exports.default.fetch(
      jsonRequest("/admin/api/settings", "PATCH", {
        brandName: "Punctum por Maria",
        tagline: "Presença e memória",
        aboutText: "Texto de apresentação administrável.",
        whatsappE164: "554799999999",
        whatsappMessage: "Olá pelo site",
        instagramUrl: "https://instagram.com/punctum.picture",
        contactEmail: "maria@example.com",
        seoTitle: "Punctum por Maria — fotografia",
        seoDescription: "Descrição pública administrável.",
      }),
    );
    expect(update.status).toBe(200);

    const site = await exports.default.fetch("http://localhost:8787/api/public/site");
    expect(await site.json()).toMatchObject({
      site: {
        brandName: "Punctum por Maria",
        tagline: "Presença e memória",
        aboutText: "Texto de apresentação administrável.",
        whatsappE164: "554799999999",
        instagramUrl: "https://instagram.com/punctum.picture",
        contactEmail: "maria@example.com",
        seoTitle: "Punctum por Maria — fotografia",
        seoDescription: "Descrição pública administrável.",
      },
    });
  });

  it("separa rascunho e publicação com revisão otimista", async () => {
    const initial = await exports.default.fetch(
      "http://localhost:8787/admin/api/studio",
    );
    expect(initial.status).toBe(200);
    const initialBody = (await initial.json()) as {
      siteConfig: typeof PUNCTUM_DEFAULT_SITE_CONFIG;
      source: string;
      revision: number;
      hasUnpublishedChanges: boolean;
      history: Array<{ id: string; isCurrent: boolean }>;
    };
    expect(initialBody.source).toBe("draft");
    expect(initialBody.siteConfig.schemaVersion).toBe(4);
    expect(initialBody.revision).toBe(1);
    expect(initialBody.hasUnpublishedChanges).toBe(false);
    expect(initialBody.history).toHaveLength(1);
    expect(initialBody.history[0].isCurrent).toBe(true);
    expect(initialBody.siteConfig.pages.home.sections.map((section) => section.type)).toEqual([
      "hero",
      "statement",
      "photo-reel",
      "featured-work",
      "about",
      "contact",
    ]);
    const publishedBefore = await exports.default.fetch(
      "http://localhost:8787/api/public/site",
    );
    const publishedBeforeBody = (await publishedBefore.json()) as {
      siteConfig: typeof PUNCTUM_DEFAULT_SITE_CONFIG;
    };
    const originalHero = publishedBeforeBody.siteConfig.editorial.home.hero.title;

    const customized = applyFontPair(
      structuredClone(initialBody.siteConfig),
      "moderna",
    );
    customized.editorial.home.hero.title = "Memórias em movimento,";
    customized.editorial.home.hero.accent = "guardadas com presença.";
    customized.editorial.chrome.footer.tagline = "Um arquivo com voz própria.";
    customized.theme.background = {
      style: "plain",
      assetId: null,
      imageId: null,
      treatment: "soft",
    };

    const update = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: customized,
        revision: initialBody.revision,
      }),
    );
    expect(update.status).toBe(200);
    const updatedBody = (await update.json()) as typeof initialBody;
    expect(updatedBody).toMatchObject({
      siteConfig: {
        editorial: {
          home: { hero: { title: "Memórias em movimento," } },
        },
        theme: {
          typography: { headingFamily: "manrope", bodyFamily: "manrope" },
          background: { style: "plain", assetId: null },
        },
      },
      source: "draft",
      revision: 2,
      hasUnpublishedChanges: true,
    });

    const stale = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: customized,
        revision: initialBody.revision,
      }),
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: "STUDIO_CHANGED_ELSEWHERE" },
      latestRevision: 2,
    });

    const publicSite = await exports.default.fetch(
      "http://localhost:8787/api/public/site",
    );
    expect(publicSite.headers.get("cache-control")).toBe("no-store");
    expect(await publicSite.json()).toMatchObject({
      siteConfig: {
        editorial: { home: { hero: { title: originalHero } } },
      },
    });

    const publish = await exports.default.fetch(
      jsonRequest("/admin/api/studio/publish", "POST", {
        revision: updatedBody.revision,
      }),
    );
    expect(publish.status).toBe(200);
    const publishedStudio = (await publish.json()) as typeof initialBody;
    expect(publishedStudio.revision).toBe(3);
    expect(publishedStudio.hasUnpublishedChanges).toBe(false);
    expect(publishedStudio.history).toHaveLength(2);

    const publicAfter = await exports.default.fetch(
      "http://localhost:8787/api/public/site",
    );
    expect(await publicAfter.json()).toMatchObject({
      site: { tagline: "Um arquivo com voz própria." },
      siteConfig: {
        editorial: {
          home: { hero: { title: "Memórias em movimento," } },
          chrome: { footer: { tagline: "Um arquivo com voz própria." } },
        },
        theme: { background: { style: "plain" } },
      },
    });

    if (!env.DB) throw new Error("Binding DB ausente");
    const snapshotCounts = await env.DB.prepare(
      `SELECT
        SUM(CASE WHEN state = 'draft' THEN 1 ELSE 0 END) AS drafts,
        SUM(CASE WHEN state = 'published' THEN 1 ELSE 0 END) AS published
       FROM site_config_versions`,
    ).first<{ drafts: number; published: number }>();
    expect(snapshotCounts).toEqual({ drafts: 1, published: 2 });
  });

  it("rejeita payloads do Studio fora dos registries e textos com código", async () => {
    const current = await exports.default.fetch("http://localhost:8787/admin/api/studio");
    const currentBody = (await current.json()) as { revision: number };
    const unknownProperty = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG) as
      typeof PUNCTUM_DEFAULT_SITE_CONFIG & { customCss?: string };
    unknownProperty.customCss = "body { display: none }";
    const unknownResponse = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: unknownProperty,
        revision: currentBody.revision,
      }),
    );
    expect(unknownResponse.status).toBe(400);

    const invalidFont = JSON.parse(
      JSON.stringify(PUNCTUM_DEFAULT_SITE_CONFIG),
    ) as Record<string, unknown>;
    const invalidTheme = invalidFont.theme as Record<string, unknown>;
    const invalidTypography = invalidTheme.typography as Record<string, unknown>;
    invalidTypography.headingFamily = "fonte-remota";
    const fontResponse = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: invalidFont,
        revision: currentBody.revision,
      }),
    );
    expect(fontResponse.status).toBe(400);

    const invalidBackground = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG) as
      typeof PUNCTUM_DEFAULT_SITE_CONFIG & {
        theme: { background: { url?: string } };
      };
    invalidBackground.theme.background.url = "https://example.com/fundo.jpg";
    const backgroundResponse = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: invalidBackground,
        revision: currentBody.revision,
      }),
    );
    expect(backgroundResponse.status).toBe(400);

    const invalidCopy = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG);
    invalidCopy.editorial.home.hero.title = "<script>alert(1)</script>";
    const copyResponse = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: invalidCopy,
        revision: currentBody.revision,
      }),
    );
    expect(copyResponse.status).toBe(400);

    const unknownSection = JSON.parse(
      JSON.stringify(PUNCTUM_DEFAULT_SITE_CONFIG),
    ) as Record<string, unknown>;
    const unknownPages = unknownSection.pages as {
      home: { sections: Array<Record<string, unknown>> };
    };
    unknownPages.home.sections.push({
      id: "home-html",
      type: "html",
      enabled: true,
      variant: "freeform",
    });
    const sectionResponse = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: unknownSection,
        revision: currentBody.revision,
      }),
    );
    expect(sectionResponse.status).toBe(400);

    const invalidVariant = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG) as {
      pages: { home: { sections: Array<{ variant: string }> } };
    };
    invalidVariant.pages.home.sections[0].variant = "fullscreen-livre";
    const variantResponse = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: invalidVariant,
        revision: currentBody.revision,
      }),
    );
    expect(variantResponse.status).toBe(400);
  });

  it("oferece somente fotos publicadas ao Studio e rejeita referências internas ausentes", async () => {
    const photosResponse = await exports.default.fetch(
      "http://localhost:8787/admin/api/studio/photos",
    );
    expect(photosResponse.status).toBe(200);
    const photosBody = (await photosResponse.json()) as {
      photos: Array<{ id: string; thumbUrl: string }>;
    };
    expect(Array.isArray(photosBody.photos)).toBe(true);
    expect(
      photosBody.photos.every(
        (photo) => photo.thumbUrl === `/media/${photo.id}/card`,
      ),
    ).toBe(true);

    const currentResponse = await exports.default.fetch(
      "http://localhost:8787/admin/api/studio",
    );
    const current = (await currentResponse.json()) as {
      siteConfig: typeof PUNCTUM_DEFAULT_SITE_CONFIG;
      revision: number;
    };
    const invalidReference = structuredClone(current.siteConfig);
    invalidReference.theme.background = {
      style: "soft-image",
      assetId: null,
      imageId: "foto-publicada-inexistente",
      treatment: "soft",
    };
    const rejected = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: invalidReference,
        revision: current.revision,
      }),
    );
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({
      error: {
        code: "STUDIO_VERSION_INVALID",
        message: "Uma das fotografias escolhidas não está mais publicada.",
      },
    });

    const unchanged = await exports.default.fetch(
      "http://localhost:8787/admin/api/studio",
    );
    expect(await unchanged.json()).toMatchObject({ revision: current.revision });
  });

  it("descarta mudanças, preserva histórico e restaura como nova publicação", async () => {
    const currentResponse = await exports.default.fetch(
      "http://localhost:8787/admin/api/studio",
    );
    const current = (await currentResponse.json()) as {
      siteConfig: typeof PUNCTUM_DEFAULT_SITE_CONFIG;
      revision: number;
      history: Array<{ id: string; isCurrent: boolean }>;
    };
    const currentPublishedTitle = current.siteConfig.editorial.home.hero.title;

    const unpublished = structuredClone(current.siteConfig);
    unpublished.editorial.home.hero.title = "Esta frase ainda está em edição";
    const savedDraftResponse = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: unpublished,
        revision: current.revision,
      }),
    );
    const savedDraft = (await savedDraftResponse.json()) as typeof current & {
      hasUnpublishedChanges: boolean;
    };
    expect(savedDraft.hasUnpublishedChanges).toBe(true);

    const publicWhileEditing = await exports.default.fetch(
      "http://localhost:8787/api/public/site",
    );
    expect(await publicWhileEditing.json()).toMatchObject({
      siteConfig: {
        editorial: { home: { hero: { title: currentPublishedTitle } } },
      },
    });

    const discard = await exports.default.fetch(
      jsonRequest("/admin/api/studio/discard", "POST", {
        revision: savedDraft.revision,
      }),
    );
    expect(discard.status).toBe(200);
    const discarded = (await discard.json()) as typeof savedDraft;
    expect(discarded.hasUnpublishedChanges).toBe(false);
    expect(discarded.siteConfig.editorial.home.hero.title).toBe(currentPublishedTitle);
    expect(discarded.history).toHaveLength(current.history.length);

    const nextPublication = structuredClone(discarded.siteConfig);
    nextPublication.editorial.home.hero.title = "Uma nova publicação segura";
    const nextDraftResponse = await exports.default.fetch(
      jsonRequest("/admin/api/studio", "PATCH", {
        siteConfig: nextPublication,
        revision: discarded.revision,
      }),
    );
    const nextDraft = (await nextDraftResponse.json()) as typeof discarded;

    const stalePublish = await exports.default.fetch(
      jsonRequest("/admin/api/studio/publish", "POST", {
        revision: discarded.revision,
      }),
    );
    expect(stalePublish.status).toBe(409);
    const publicAfterFailedPublish = await exports.default.fetch(
      "http://localhost:8787/api/public/site",
    );
    expect(await publicAfterFailedPublish.json()).toMatchObject({
      siteConfig: {
        editorial: { home: { hero: { title: currentPublishedTitle } } },
      },
    });

    const publish = await exports.default.fetch(
      jsonRequest("/admin/api/studio/publish", "POST", {
        revision: nextDraft.revision,
      }),
    );
    const published = (await publish.json()) as typeof nextDraft;
    expect(publish.status).toBe(200);
    expect(published.history).toHaveLength(current.history.length + 1);

    const oldestVersion = published.history[published.history.length - 1];
    const restore = await exports.default.fetch(
      jsonRequest("/admin/api/studio/restore", "POST", {
        revision: published.revision,
        versionId: oldestVersion.id,
      }),
    );
    expect(restore.status).toBe(200);
    const restored = (await restore.json()) as typeof published;
    expect(restored.history).toHaveLength(published.history.length + 1);
    expect(restored.history[0]).toMatchObject({
      isCurrent: true,
      restoredFromVersionId: oldestVersion.id,
    });

    if (!env.DB) throw new Error("Binding DB ausente");
    const previousSnapshot = await env.DB.prepare(
      "SELECT state, config_json AS configJson FROM site_config_versions WHERE id = ?",
    )
      .bind(published.history[0].id)
      .first<{ state: string; configJson: string }>();
    expect(previousSnapshot?.state).toBe("published");
    expect(JSON.parse(previousSnapshot?.configJson ?? "{}")).toMatchObject({
      editorial: { home: { hero: { title: "Uma nova publicação segura" } } },
    });
  });

  it("protege e isola o preview administrativo", async () => {
    const preview = await exports.default.fetch(
      "http://localhost:8787/admin/studio/preview",
    );
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(preview.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(preview.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(preview.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'self'",
    );

    const internal = await exports.default.fetch(
      "http://localhost:8787/studio-preview-internal",
    );
    expect(internal.status).toBe(404);

    const unauthorized = await exports.default.fetch(
      new Request("https://punctumpicture.com/admin/studio/preview", {
        headers: { "cf-access-jwt-assertion": "token-invalido" },
      }),
    );
    expect(unauthorized.status).toBe(403);
  });

  it("não publica um snapshot estruturalmente inválido", async () => {
    if (!env.DB) throw new Error("Binding DB ausente");
    const studioResponse = await exports.default.fetch(
      "http://localhost:8787/admin/api/studio",
    );
    const studio = (await studioResponse.json()) as { revision: number };
    const before = await env.DB.prepare(
      `SELECT draft_version_id AS draftVersionId,
        published_version_id AS publishedVersionId
       FROM site_config_pointers WHERE id = 1`,
    ).first<{ draftVersionId: string; publishedVersionId: string }>();
    if (!before) throw new Error("Ponteiros ausentes");

    await env.DB.prepare(
      "UPDATE site_config_versions SET config_json = ? WHERE id = ?",
    )
      .bind('{"schemaVersion":999,"customCss":"body{display:none}"}', before.draftVersionId)
      .run();

    const rejected = await exports.default.fetch(
      jsonRequest("/admin/api/studio/publish", "POST", {
        revision: studio.revision,
      }),
    );
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({
      error: { code: "STUDIO_VERSION_INVALID" },
    });
    const pointerAfter = await env.DB.prepare(
      "SELECT published_version_id AS publishedVersionId FROM site_config_pointers WHERE id = 1",
    ).first<{ publishedVersionId: string }>();
    expect(pointerAfter?.publishedVersionId).toBe(before.publishedVersionId);

    const repaired = await exports.default.fetch(
      jsonRequest("/admin/api/studio/discard", "POST", {
        revision: studio.revision,
      }),
    );
    expect(repaired.status).toBe(200);
  });

  it("disponibiliza todo o acervo existente no banco administrativo", async () => {
    if (!env.DB) throw new Error("Binding DB ausente");
    const totals = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM albums WHERE deleted_at IS NULL) AS albums,
        (SELECT COUNT(*) FROM images WHERE deleted_at IS NULL) AS images`,
    ).first<{ albums: number; images: number }>();
    expect(totals).toEqual({ albums: 14, images: 113 });

    const publicAlbums = await exports.default.fetch(
      "http://localhost:8787/api/public/albums?limit=24",
    );
    expect(publicAlbums.status).toBe(200);
    const body = (await publicAlbums.json()) as {
      albums: Array<{
        slug: string;
        categories: Array<{ id: string; name: string; slug: string }>;
      }>;
    };
    expect(body.albums).toHaveLength(13);
    const rites = body.albums.find((album) => album.slug === "ritos-de-luz");
    expect(rites?.categories.map((category) => category.slug)).toEqual([
      "documental",
    ]);

    const updateCategory = await exports.default.fetch(
      jsonRequest("/admin/api/albums/static-ritos-de-luz", "PATCH", {
        categoryIds: ["portfolio-musica"],
        seoTitle: "Fé documentada",
        seoDescription: "SEO dinâmico do ensaio publicado.",
      }),
    );
    expect(updateCategory.status).toBe(200);

    const refreshed = await exports.default.fetch(
      "http://localhost:8787/api/public/albums?limit=100",
    );
    const refreshedBody = (await refreshed.json()) as typeof body;
    expect(
      refreshedBody.albums
        .find((album) => album.slug === "ritos-de-luz")
        ?.categories.map((category) => category.slug),
    ).toEqual(["musica"]);

    const liveAlbum = await exports.default.fetch(
      "http://localhost:8787/api/public/albums/ritos-de-luz",
    );
    expect(await liveAlbum.json()).toMatchObject({
      album: {
        title: "Fé e Tradição",
        seoTitle: "Fé documentada",
        seoDescription: "SEO dinâmico do ensaio publicado.",
        coverUrl: "/media/static-p009/card",
      },
    });

    const stats = await exports.default.fetch("http://localhost:8787/api/public/stats");
    expect(stats.status).toBe(200);
    expect(await stats.json()).toMatchObject({
      stats: { photoCount: 112, albumCount: 13, categoryCount: 7 },
    });

    const archive = await exports.default.fetch("http://localhost:8787/api/public/archive");
    expect(archive.status).toBe(200);
    const archiveBody = (await archive.json()) as {
      images: Array<{
        id: string;
        albumSlug: string;
        categories: Array<{ slug: string }>;
      }>;
    };
    expect(archiveBody.images).toHaveLength(112);
    expect(archiveBody.images.every((image) => image.albumSlug)).toBe(true);
  });

  it("remove álbum arquivado e sua mídia do público, preservando preview admin", async () => {
    if (!env.DB) throw new Error("Binding DB ausente");

    const draftMedia = await exports.default.fetch(
      "http://localhost:8787/media/static-p001/thumb",
    );
    expect(draftMedia.status).toBe(404);
    const draftAdminMedia = await exports.default.fetch(
      "http://localhost:8787/admin/media/static-p001/thumb",
    );
    expect(draftAdminMedia.status).toBe(200);
    expect(draftAdminMedia.headers.get("cache-control")).toBe("private, no-store");

    const publishedMedia = await exports.default.fetch(
      "http://localhost:8787/media/static-p005/thumb",
    );
    expect(publishedMedia.status).toBe(200);
    expect(publishedMedia.headers.get("cache-control")).toContain("max-age=300");

    const archive = await exports.default.fetch(
      jsonRequest("/admin/api/albums/static-velocidade-e-materia/archive", "POST"),
    );
    expect(archive.status).toBe(200);

    try {
      const albums = await exports.default.fetch(
        "http://localhost:8787/api/public/albums?limit=100",
      );
      const body = (await albums.json()) as { albums: Array<{ slug: string }> };
      expect(body.albums.some((album) => album.slug === "velocidade-e-materia")).toBe(
        false,
      );

      const detail = await exports.default.fetch(
        "http://localhost:8787/api/public/albums/velocidade-e-materia",
      );
      expect(detail.status).toBe(404);

      const hiddenMedia = await exports.default.fetch(
        "http://localhost:8787/media/static-p005/thumb",
      );
      expect(hiddenMedia.status).toBe(404);

      const adminMedia = await exports.default.fetch(
        "http://localhost:8787/admin/media/static-p005/thumb",
      );
      expect(adminMedia.status).toBe(200);
      expect(adminMedia.headers.get("cache-control")).toBe("private, no-store");
    } finally {
      await env.DB.prepare(
        "UPDATE albums SET status = 'published' WHERE id = 'static-velocidade-e-materia'",
      ).run();
    }
  });

  it("inclui arquivo e somente álbuns publicados no sitemap", async () => {
    const response = await exports.default.fetch("http://localhost:8787/sitemap.xml");
    expect(response.status).toBe(200);
    const xml = await response.text();
    expect(xml).toContain("http://localhost:8787/arquivo");
    expect(xml).toContain("http://localhost:8787/fotografia");
    expect(xml).toContain("http://localhost:8787/fotografia/joinville");
    expect(xml).toContain("http://localhost:8787/fotografia/curitiba");
    expect(xml).toContain("http://localhost:8787/fotografia/sao-bento-do-sul");
    expect(xml).toContain("http://localhost:8787/fotografia/rio-negrinho");
    expect(xml).toContain("http://localhost:8787/fotografia/campo-alegre");
    expect(xml).toContain("http://localhost:8787/servicos");
    expect(xml).toContain("http://localhost:8787/servicos/retratos");
    expect(xml).toContain("http://localhost:8787/servicos/eventos");
    expect(xml).toContain("http://localhost:8787/servicos/musica-e-shows");
    expect(xml).toContain("http://localhost:8787/servicos/fotografia-esportiva");
    expect(xml).toContain("http://localhost:8787/servicos/familias");
    expect(xml).toContain("http://localhost:8787/servicos/fotografia-documental");
    expect(xml).toContain("http://localhost:8787/ensaios/ritos-de-luz");
    expect(xml).not.toContain("http://localhost:8787/ensaios/maria-helena");
  });

  it("aceita contato e neutraliza honeypot", async () => {
    const honeypot = await exports.default.fetch(
      jsonRequest("/api/public/inquiries", "POST", {
        name: "Robô",
        message: "Mensagem que não deve ser armazenada.",
        website: "https://spam.example",
      }),
    );
    expect(honeypot.status).toBe(201);

    const valid = await exports.default.fetch(
      jsonRequest("/api/public/inquiries", "POST", {
        name: "Cliente Exemplo",
        email: "cliente@exemplo.com",
        message: "Quero orçamento para um ensaio externo.",
      }),
    );
    expect(valid.status).toBe(201);
  });

  it("executa o fluxo essencial de álbum, upload, capa, reorder e exclusão", async () => {
    const create = await exports.default.fetch(
      jsonRequest("/admin/api/albums", "POST", { title: "Ensaio de teste" }),
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { album: { id: string } };
    const albumId = created.album.id;

    const blockedPublish = await exports.default.fetch(
      jsonRequest(`/admin/api/albums/${albumId}/publish`, "POST"),
    );
    expect(blockedPublish.status).toBe(409);

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const intentResponse = await exports.default.fetch(
      jsonRequest("/admin/api/uploads/intents", "POST", {
        albumId,
        filename: "teste.jpg",
        mimeType: "image/jpeg",
        sizeBytes: bytes.byteLength,
      }),
    );
    expect(intentResponse.status).toBe(201);
    const intent = (await intentResponse.json()) as {
      intentId: string;
      imageId: string;
      uploadUrl: string;
    };

    const upload = await exports.default.fetch(
      new Request(intent.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
          Origin: "http://localhost:8787",
        },
        body: bytes,
      }),
    );
    expect(upload.status).toBe(200);

    const complete = await exports.default.fetch(
      jsonRequest(`/admin/api/uploads/${intent.intentId}/complete`, "POST", {}),
    );
    expect(complete.status).toBe(200);

    const cover = await exports.default.fetch(
      jsonRequest(`/admin/api/albums/${albumId}/cover`, "POST", {
        imageId: intent.imageId,
      }),
    );
    expect(cover.status).toBe(200);

    const reorder = await exports.default.fetch(
      jsonRequest(`/admin/api/albums/${albumId}/reorder`, "POST", {
        imageIds: [intent.imageId],
      }),
    );
    expect(reorder.status).toBe(200);

    const publish = await exports.default.fetch(
      jsonRequest(`/admin/api/albums/${albumId}/publish`, "POST"),
    );
    expect(publish.status).toBe(200);

    const remove = await exports.default.fetch(
      jsonRequest(`/admin/api/images/${intent.imageId}`, "DELETE"),
    );
    expect(remove.status).toBe(200);

    if (!env.DB) throw new Error("Binding DB ausente");
    const album = await env.DB.prepare("SELECT cover_image_id AS cover FROM albums WHERE id = ?")
      .bind(albumId)
      .first<{ cover: string | null }>();
    expect(album?.cover).toBeNull();
  });

  it("cria sessão administrativa apenas para os e-mails permitidos", async () => {
    const login = await exports.default.fetch(
      new Request("https://example.com/admin/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          email: "menezesx2k26@gmail.com",
          password: "test-password",
        }),
      }),
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toMatch(/^punctum_admin_session=/);

    const current = await exports.default.fetch(
      new Request("https://example.com/admin/api/me", {
        headers: { Cookie: cookie ?? "" },
      }),
    );
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({
      email: "menezesx2k26@gmail.com",
      roles: ["admin"],
    });

    const rejected = await exports.default.fetch(
      new Request("https://example.com/admin/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          email: "outra-pessoa@example.com",
          password: "test-password",
        }),
      }),
    );
    expect(rejected.status).toBe(401);

    const change = await exports.default.fetch(
      new Request("https://example.com/admin/api/session", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          Cookie: cookie ?? "",
        },
        body: JSON.stringify({
          currentPassword: "test-password",
          newPassword: "NovaSenhaDefinitiva2026!",
        }),
      }),
    );
    expect(change.status).toBe(200);
    expect(change.headers.get("set-cookie")).toContain("Max-Age=0");

    const oldPassword = await exports.default.fetch(
      new Request("https://example.com/admin/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          email: "menezesx2k26@gmail.com",
          password: "test-password",
        }),
      }),
    );
    expect(oldPassword.status).toBe(401);

    const definitivePassword = await exports.default.fetch(
      new Request("https://example.com/admin/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          email: "maria.helena.ifc@gmail.com",
          password: "NovaSenhaDefinitiva2026!",
        }),
      }),
    );
    expect(definitivePassword.status).toBe(200);
  });

  it("inicializa snapshots a partir de SiteConfig antigo sem alterar o original", async () => {
    if (!env.DB) throw new Error("Binding DB ausente");
    const v2 = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG) as Record<string, unknown>;
    delete v2.pages;
    v2.schemaVersion = 2;
    const legacyTheme = v2.theme as Record<string, unknown>;
    legacyTheme.background = { style: "organic-glow", assetId: null };
    legacyTheme.collage = { style: "off" };
    const legacyJson = JSON.stringify(v2);

    await env.DB.prepare("DELETE FROM site_config_pointers").run();
    await env.DB.prepare("DELETE FROM site_config_versions").run();
    await env.DB.prepare(
      `INSERT INTO site_config (id, schema_version, config_json, updated_at, updated_by)
       VALUES (1, 2, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET schema_version = excluded.schema_version,
         config_json = excluded.config_json, updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
      .bind(legacyJson, "2026-08-22T18:00:00.000Z", "migration-test@example.com")
      .run();

    const studio = await exports.default.fetch(
      "http://localhost:8787/admin/api/studio",
    );
    expect(studio.status).toBe(200);
    expect(await studio.json()).toMatchObject({
      source: "draft",
      revision: 1,
      hasUnpublishedChanges: false,
      issues: ["SiteConfig v2 migrado em memória para v4."],
      siteConfig: {
        schemaVersion: 4,
        pages: {
          home: { sections: expect.any(Array) },
        },
      },
    });

    const legacyStillIntact = await env.DB.prepare(
      "SELECT schema_version AS schemaVersion, config_json AS configJson FROM site_config WHERE id = 1",
    ).first<{ schemaVersion: number; configJson: string }>();
    expect(legacyStillIntact).toEqual({ schemaVersion: 2, configJson: legacyJson });
  });

  it("publica apenas Colagem Autoral e preserva integralmente o rascunho pendente", async () => {
    const beforePublic = await exports.default.fetch("http://localhost:8787/api/public/site");
    const publicConfig = ((await beforePublic.json()) as { siteConfig: typeof PUNCTUM_DEFAULT_SITE_CONFIG }).siteConfig;
    const before = await exports.default.fetch("http://localhost:8787/admin/api/studio");
    const studio = (await before.json()) as {
      siteConfig: typeof PUNCTUM_DEFAULT_SITE_CONFIG;
      revision: number;
      history: Array<{ id: string; isCurrent: boolean }>;
    };
    const previousVersion = studio.history.find(x => x.isCurrent)?.id;
    expect(previousVersion).toBeTruthy();

    const pending = structuredClone(studio.siteConfig);
    pending.editorial.home.hero.title = "Rascunho privado não deve ser publicado";
    const save = await exports.default.fetch(jsonRequest("/admin/api/studio", "PATCH", {
      siteConfig: pending, revision: studio.revision,
    }));
    expect(save.status).toBe(200);
    const saved = (await save.json()) as { revision: number; siteConfig: typeof pending };

    const publish = await exports.default.fetch(jsonRequest("/admin/api/studio/publish-visual", "POST", {
      presetId: "colagem-autoral",
      expectedPublishedVersionId: previousVersion,
      expectedDraftRevision: saved.revision,
    }));
    expect(publish.status).toBe(200);
    const published = await exports.default.fetch("http://localhost:8787/api/public/site");
    const publishedConfig = ((await published.json()) as { siteConfig: typeof publicConfig }).siteConfig;
    expect(publishedConfig.identity.sourcePresetId).toBe("colagem-autoral");
    expect(publishedConfig.editorial).toEqual(publicConfig.editorial);
    expect(publishedConfig.pages.home.sections.map(x => x.id))
      .toEqual(publicConfig.pages.home.sections.map(x => x.id));
    expect(publishedConfig.editorial.home.hero.title).not.toBe(pending.editorial.home.hero.title);

    const after = await exports.default.fetch("http://localhost:8787/admin/api/studio");
    const draftAfter = (await after.json()) as {
      revision: number;
      siteConfig: typeof pending;
      hasUnpublishedChanges: boolean;
      history: Array<{ id: string; isCurrent: boolean }>;
    };
    expect(draftAfter.siteConfig).toEqual(pending);
    expect(draftAfter.revision).toBe(saved.revision);
    expect(draftAfter.hasUnpublishedChanges).toBe(true);
    expect(draftAfter.history.find(x => x.isCurrent)?.id).not.toBe(previousVersion);
    expect(draftAfter.history.some(x => x.id === previousVersion)).toBe(true);

    const stale = await exports.default.fetch(jsonRequest("/admin/api/studio/publish-visual", "POST", {
      presetId: "colagem-autoral",
      expectedPublishedVersionId: previousVersion,
      expectedDraftRevision: saved.revision,
    }));
    expect(stale.status).toBe(409);
  });

  it("rejeita Access inválido, preset inválido e imagem ausente", async () => {
    const access = await exports.default.fetch(
      new Request("https://punctumpicture.com/admin/api/me", {
        headers: { "cf-access-jwt-assertion": "token-invalido" },
      }),
    );
    expect(access.status).toBe(403);

    const preset = await exports.default.fetch(
      "http://localhost:8787/media/inexistente/largura-arbitraria",
    );
    expect(preset.status).toBe(400);

    const image = await exports.default.fetch(
      "http://localhost:8787/media/inexistente/thumb",
    );
    expect(image.status).toBe(404);
  });
});
