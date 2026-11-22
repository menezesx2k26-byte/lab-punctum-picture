import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import initMigration from "../../migrations/0001_init.sql?raw";
import settingsSeed from "../../migrations/0002_seed_settings.sql?raw";
import operationsMigration from "../../migrations/0003_operations.sql?raw";
import whatsappMigration from "../../migrations/0004_whatsapp_contact.sql?raw";
import foundationMigration from "../../migrations/0005_foundation_reconcile.sql?raw";
import editorialMigration from "../../migrations/0006_editorial_personality.sql?raw";
import versionedConfigMigration from "../../migrations/0007_site_config_versions.sql?raw";
import siteMediaMigration from "../../migrations/0008_site_media.sql?raw";
import { selectSiteMediaHero } from "../../app/admin/components/studio/hero-media";
import {
  InvalidStoredSiteConfigError,
  publishDraftSiteConfig,
  readDraftSiteConfigState,
  readPublicSiteConfigState,
  saveDraftSiteConfig,
} from "../../shared/site-config-storage";
import { serveMedia } from "../../worker/media/serve";
import { createAdminSession, requireAdmin } from "../../worker/utils/auth";

async function applySql(sql: string) {
  if (!env.DB) throw new Error("Binding DB ausente no teste");
  for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}

function jsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost:8787${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:8787" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("mídia independente do Hero", () => {
  beforeAll(async () => {
    await applySql(initMigration);
    await applySql(settingsSeed);
    await applySql(operationsMigration);
    await applySql(whatsappMigration);
    await applySql(foundationMigration);
    await applySql(editorialMigration);
    await applySql(versionedConfigMigration);
    await applySql(siteMediaMigration);
  });

  it("cria um envio de Hero sem albumId e lista a mídia no Studio", async () => {
    const response = await exports.default.fetch(jsonRequest("/admin/api/site-media/intents", "POST", {
      filename: "hero-celular.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 2_000_000,
      role: "hero",
    }));
    expect(response.status).toBe(201);
    const body = await response.json() as {
      media: { id: string; role: string; status: string };
      uploadUrl: string;
      requiredHeaders: Record<string, string>;
      albumId?: string;
    };
    expect(body.albumId).toBeUndefined();
    expect(body.media).toMatchObject({ role: "hero", status: "pending" });
    expect(body.uploadUrl).toContain(`/admin/api/site-media/${body.media.id}/direct`);
    expect(body.requiredHeaders["Content-Type"]).toBe("image/jpeg");

    const list = await exports.default.fetch("http://localhost:8787/admin/api/site-media?role=hero");
    expect(list.status).toBe(200);
    const listed = await list.json() as { media: Array<{ id: string; role: string }> };
    expect(listed.media.some((item) => item.id === body.media.id && item.role === "hero")).toBe(true);
  }, 90_000); // Worker startup and D1 migration-backed fixture exceed the 20s default on the shared Linux runner.

  it("rejeita tipo inválido e arquivo acima de 25 MiB", async () => {
    const invalidType = await exports.default.fetch(jsonRequest("/admin/api/site-media/intents", "POST", {
      filename: "hero.gif", mimeType: "image/gif", sizeBytes: 1000, role: "hero",
    }));
    expect(invalidType.status).toBe(400);

    const tooLarge = await exports.default.fetch(jsonRequest("/admin/api/site-media/intents", "POST", {
      filename: "hero.jpg", mimeType: "image/jpeg", sizeBytes: 26_214_401, role: "hero",
    }));
    expect(tooLarge.status).toBe(400);
  }, 60_000); // The 25 MiB rejection path is measured separately from worker startup.

  it.each(["pending", "failed", "missing"] as const)(
    "preserva a publicação ao tentar publicar Hero %s",
    async (status) => {
      const draft = await readDraftSiteConfigState(env.DB);
      const before = await readPublicSiteConfigState(env.DB);
      const id = crypto.randomUUID();
      if (status !== "missing") {
        await env.DB.prepare(
          `INSERT INTO site_media (id, role, storage_key, original_filename, mime_type,
            size_bytes, status, created_at, updated_at)
           VALUES (?, 'hero', ?, 'hero.png', 'image/png', 8, ?, '2026-11-22', '2026-11-22')`,
        ).bind(id, `site-media/hero/${id}.png`, status).run();
      }
      const config = selectSiteMediaHero(draft.config, id);
      await env.DB.prepare("UPDATE site_config_versions SET config_json = ? WHERE id = ?")
        .bind(JSON.stringify(config), draft.versionId).run();

      try {
        await expect(publishDraftSiteConfig(env.DB, draft.revision, "test-admin"))
          .rejects.toBeInstanceOf(InvalidStoredSiteConfigError);
        expect(await readPublicSiteConfigState(env.DB)).toEqual(before);
      } finally {
        await env.DB.prepare("UPDATE site_config_versions SET config_json = ? WHERE id = ?")
          .bind(JSON.stringify(draft.config), draft.versionId).run();
      }
    },
  );

  it("restringe o Hero pronto ao admin até publicar e retira bytes públicos após substituir", async () => {
    const id = crypto.randomUUID();
    const key = `site-media/hero/${id}.png`;
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    await env.DB.prepare(
      `INSERT INTO site_media (id, role, storage_key, original_filename, mime_type,
        size_bytes, status, width, height, created_at, updated_at)
       VALUES (?, 'hero', ?, 'hero.png', 'image/png', 8, 'ready', 1280, 720, '2026-11-22', '2026-11-22')`,
    ).bind(id, key).run();
    await env.ORIGINALS.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
    const qaEnv = { ...env, ENVIRONMENT: "qa", IMAGES: undefined } as unknown as Env;
    const mediaRequest = (cookie?: string) => new Request(`http://localhost:8787/media/${id}/display`, {
      headers: cookie ? { Cookie: cookie } : {},
    });
    const draft = await readDraftSiteConfigState(env.DB);
    const saved = await saveDraftSiteConfig(env.DB, selectSiteMediaHero(draft.config, id), draft.revision, "test-admin");
    await expect(serveMedia(mediaRequest(), qaEnv, id, "display"))
      .rejects.toMatchObject({ status: 404, code: "IMAGE_NOT_FOUND" });

    const adminCookie = `punctum_admin_session=${await createAdminSession("maria.helena.ifc@gmail.com", qaEnv)}`;
    const previewRequest = new Request(`https://qa.example/admin/media/${id}/display`, {
      headers: { Cookie: adminCookie },
    });
    await expect(requireAdmin(new Request(previewRequest.url), qaEnv))
      .rejects.toMatchObject({ status: 403 });
    await expect(requireAdmin(previewRequest, qaEnv)).resolves.toMatchObject({ roles: ["admin"] });
    const preview = await serveMedia(previewRequest, qaEnv, id, "display", { audience: "admin" });
    expect(preview.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(bytes);

    const published = await publishDraftSiteConfig(env.DB, saved.revision, "test-admin");
    const response = await serveMedia(mediaRequest(), qaEnv, id, "display");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    const replacement = await saveDraftSiteConfig(env.DB, draft.config, published.revision, "test-admin");
    await publishDraftSiteConfig(env.DB, replacement.revision, "test-admin");
    await expect(serveMedia(mediaRequest(), qaEnv, id, "display"))
      .rejects.toMatchObject({ status: 404, code: "IMAGE_NOT_FOUND" });
  });

  it("usa o fallback sem reescrever o snapshot quando um Hero publicado deixa de estar pronto", async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO site_media (id, role, storage_key, original_filename, mime_type,
        size_bytes, status, created_at, updated_at)
       VALUES (?, 'hero', ?, 'hero.png', 'image/png', 8, 'ready', '2026-11-22', '2026-11-22')`,
    ).bind(id, `site-media/hero/${id}.png`).run();
    const draft = await readDraftSiteConfigState(env.DB);
    const saved = await saveDraftSiteConfig(env.DB, selectSiteMediaHero(draft.config, id), draft.revision, "test-admin");
    await publishDraftSiteConfig(env.DB, saved.revision, "test-admin");
    const before = await readPublicSiteConfigState(env.DB);
    const rawBefore = await env.DB.prepare("SELECT config_json FROM site_config_versions WHERE id = ?")
      .bind(before.versionId).first();
    await env.DB.prepare("UPDATE site_media SET status = 'failed' WHERE id = ?").bind(id).run();

    const after = await readPublicSiteConfigState(env.DB);
    const hero = after.config.pages.home.sections.find((section) => section.type === "hero");
    expect(hero?.type === "hero" ? hero.heroMedia : undefined).toBeNull();
    expect(after.versionId).toBe(before.versionId);
    expect(await env.DB.prepare("SELECT config_json FROM site_config_versions WHERE id = ?")
      .bind(before.versionId).first()).toEqual(rawBefore);
  });
});
