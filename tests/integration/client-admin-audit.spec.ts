import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { handlePrivateGalleryRoutes } from "../../worker/client/router";
import { bootstrapPrivateDb, privateRequest, seedClient, seedGallery, seedReadyImage } from "./client-fixture";

describe("private administrative state changes have an attributed audit event", () => {
  beforeAll(bootstrapPrivateDb);
  it("rolls back Access reauthorization when its audit insert fails and retries exactly once", async () => {
    const client = await seedClient();
    await env.DB.prepare("UPDATE client_accounts SET must_change_password=1,password_iterations=620000,session_version=7 WHERE id=?").bind(client).run();
    const before = await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first();
    const testEnv = { ...env, CLIENT_AUTH_MODE: "access" } as Env;
    const reauthorize = () => {
      const request = privateRequest(`/admin/api/clientes/${client}/reset-password`, "POST", {});
      return handlePrivateGalleryRoutes(request, new URL(request.url), testEnv);
    };
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_access_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.entity_id='${client}' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await reauthorize())?.status).toBe(500);
      expect(await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first()).toEqual(before);
      expect(await env.DB.prepare("SELECT id FROM audit_log WHERE entity_id=?").bind(client).first()).toBeNull();
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_access_audit_failure").run();
    }
    const retry = await reauthorize();
    expect(retry?.status).toBe(200);
    expect(await retry?.json()).toEqual({ ok: true, authMode: "access" });
    const after = await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first();
    expect(after).toEqual({
      ...before,
      password_hash: "ACCESS_ONLY",
      password_salt: "ACCESS_ONLY",
      password_iterations: 310000,
      must_change_password: 0,
      session_version: 8,
      updated_at: expect.any(String),
    });
    expect(after?.updated_at).not.toBe(before?.updated_at);
    const events = await env.DB.prepare("SELECT actor_email,action,entity_type,entity_id,data_json,created_at FROM audit_log WHERE entity_id=?").bind(client).all();
    expect(events.results).toEqual([{
      actor_email: "maria.helena@local.dev",
      action: "client.access_reauthorized",
      entity_type: "client_account",
      entity_id: client,
      data_json: null,
      created_at: expect.any(String),
    }]);
  }, 60_000);
  it("rolls back password-mode reset when its audit insert fails and retries exactly once", async () => {
    const client = await seedClient();
    const testEnv = { ...env, CLIENT_AUTH_MODE: "password" } as Env;
    const before = await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first();
    const reset = () => {
      const request = privateRequest(`/admin/api/clientes/${client}/reset-password`, "POST", {});
      return handlePrivateGalleryRoutes(request, new URL(request.url), testEnv);
    };
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_password_reset_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.entity_id='${client}' AND NEW.action='client.password_reset' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await reset())?.status).toBe(500);
      expect(await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first()).toEqual(before);
      expect(await env.DB.prepare("SELECT id FROM audit_log WHERE entity_id=? AND action='client.password_reset'").bind(client).first()).toBeNull();
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_password_reset_audit_failure").run();
    }
    const retry = await reset();
    expect(retry?.status).toBe(200);
    const body = await retry?.json() as { temporaryPassword?: string };
    expect(body.temporaryPassword).toEqual(expect.any(String));
    expect(body.temporaryPassword?.length).toBeGreaterThan(0);
    const after = await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first();
    expect(after).toEqual({
      ...before,
      password_hash: expect.any(String),
      password_salt: expect.any(String),
      password_iterations: 310000,
      must_change_password: 1,
      session_version: (before?.session_version as number) + 1,
      updated_at: expect.any(String),
    });
    expect(after?.password_hash).not.toBe(before?.password_hash);
    expect(after?.updated_at).not.toBe(before?.updated_at);
    const events = await env.DB.prepare("SELECT actor_email,action,entity_type,entity_id,data_json,created_at FROM audit_log WHERE entity_id=? AND action='client.password_reset'").bind(client).all();
    expect(events.results).toEqual([{
        actor_email: "maria.helena@local.dev",
        action: "client.password_reset",
        entity_type: "client_account",
        entity_id: client,
        data_json: null,
        created_at: expect.any(String),
      }]);
  }, 60_000);
  it("rolls back client creation when its audit insert fails and retries exactly once", async () => {
    const email = `${crypto.randomUUID()}@example.com`;
    const testEnv = { ...env, CLIENT_AUTH_MODE: "access" } as Env;
    const auditCountBefore = await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action='client.created'").first<{ count: number }>();
    const create = () => {
      const request = privateRequest("/admin/api/clientes", "POST", { name: "Novo cliente", email });
      return handlePrivateGalleryRoutes(request, new URL(request.url), testEnv);
    };
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_client_create_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.action='client.created' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await create())?.status).toBe(500);
      expect(await env.DB.prepare("SELECT id FROM client_accounts WHERE email=?").bind(email).first()).toBeNull();
      expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action='client.created'").first())
        .toEqual(auditCountBefore);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_client_create_audit_failure").run();
    }
    const retry = await create();
    expect(retry?.status).toBe(201);
    const body = await retry?.json() as { client: { id: string } };
    expect(await env.DB.prepare("SELECT email FROM client_accounts WHERE id=?").bind(body.client.id).first())
      .toEqual({ email });
    expect(await env.DB.prepare("SELECT actor_email,action,entity_id FROM audit_log WHERE entity_id=?").bind(body.client.id).first())
      .toEqual({ actor_email: "maria.helena@local.dev", action: "client.created", entity_id: body.client.id });
  }, 60_000);
  it("rolls back private gallery creation when its audit insert fails and retries exactly once", async () => {
    const client = await seedClient();
    const title = `Audit retry ${crypto.randomUUID()}`;
    const create = () => exports.default.fetch(privateRequest("/admin/api/albuns-privados", "POST", {
      clientId: client, title, theme: "noir",
    }));
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_gallery_create_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.action='client_gallery.created' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await create()).status).toBe(500);
      expect(await env.DB.prepare("SELECT id FROM client_galleries WHERE client_id=? AND title=?").bind(client, title).first()).toBeNull();
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_gallery_create_audit_failure").run();
    }
    const retry = await create();
    expect(retry.status).toBe(201);
    const body = await retry.json() as { gallery: { id: string; title: string } };
    expect(body.gallery.title).toBe(title);
    expect(await env.DB.prepare("SELECT actor_email,action,entity_id FROM audit_log WHERE entity_id=?").bind(body.gallery.id).first())
      .toEqual({ actor_email: "maria.helena@local.dev", action: "client_gallery.created", entity_id: body.gallery.id });
  }, 60_000);
  it("rolls back gallery cover changes when their audit insert fails and retries", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const image = await seedReadyImage(gallery);
    const before = await env.DB.prepare("SELECT cover_image_id,updated_at FROM client_galleries WHERE id=?").bind(gallery).first();
    const setCover = () => exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}/cover`, "PUT", { imageId: image }));
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_cover_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.entity_id='${gallery}' AND NEW.action='client_gallery.cover_changed' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await setCover()).status).toBe(500);
      expect(await env.DB.prepare("SELECT cover_image_id,updated_at FROM client_galleries WHERE id=?").bind(gallery).first()).toEqual(before);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_cover_audit_failure").run();
    }
    expect((await setCover()).status).toBe(200);
    expect(await env.DB.prepare("SELECT cover_image_id FROM client_galleries WHERE id=?").bind(gallery).first()).toEqual({ cover_image_id: image });
    expect(await env.DB.prepare("SELECT action FROM audit_log WHERE entity_id=? AND action='client_gallery.cover_changed'").bind(gallery).first())
      .toEqual({ action: "client_gallery.cover_changed" });
  }, 60_000);
  it("rolls back gallery ordering when its audit insert fails and retries", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const first = await seedReadyImage(gallery);
    const second = await seedReadyImage(gallery);
    const before = await env.DB.prepare("SELECT id,position,updated_at FROM client_gallery_images WHERE gallery_id=? ORDER BY id").bind(gallery).all();
    const reorder = () => exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}/order`, "PUT", { imageIds: [second, first] }));
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_order_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.entity_id='${gallery}' AND NEW.action='client_gallery.images_reordered' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await reorder()).status).toBe(500);
      expect((await env.DB.prepare("SELECT id,position,updated_at FROM client_gallery_images WHERE gallery_id=? ORDER BY id").bind(gallery).all()).results).toEqual(before.results);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_order_audit_failure").run();
    }
    expect((await reorder()).status).toBe(200);
    expect((await env.DB.prepare("SELECT id,position FROM client_gallery_images WHERE gallery_id=? ORDER BY position").bind(gallery).all()).results)
      .toEqual([{ id: second, position: 0 }, { id: first, position: 1 }]);
    expect(await env.DB.prepare("SELECT action FROM audit_log WHERE entity_id=? AND action='client_gallery.images_reordered'").bind(gallery).first())
      .toEqual({ action: "client_gallery.images_reordered" });
  }, 60_000);
  it("rolls back gallery publication when its audit insert fails and retries", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const cover = await seedReadyImage(gallery);
    await env.DB.prepare("UPDATE client_galleries SET cover_image_id=? WHERE id=?").bind(cover, gallery).run();
    const before = await env.DB.prepare("SELECT status,published_at,updated_at FROM client_galleries WHERE id=?").bind(gallery).first();
    const publish = () => exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}/publish`, "POST", {}));
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_publish_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.entity_id='${gallery}' AND NEW.action='client_gallery.published' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await publish()).status).toBe(500);
      expect(await env.DB.prepare("SELECT status,published_at,updated_at FROM client_galleries WHERE id=?").bind(gallery).first()).toEqual(before);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_publish_audit_failure").run();
    }
    expect((await publish()).status).toBe(200);
    expect(await env.DB.prepare("SELECT status FROM client_galleries WHERE id=?").bind(gallery).first()).toEqual({ status: "published" });
    expect(await env.DB.prepare("SELECT action FROM audit_log WHERE entity_id=? AND action='client_gallery.published'").bind(gallery).first())
      .toEqual({ action: "client_gallery.published" });
  }, 60_000);
  it("rolls back gallery edits when their audit insert fails and retries", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const before = await env.DB.prepare("SELECT * FROM client_galleries WHERE id=?").bind(gallery).first();
    const update = () => exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}`, "PATCH", { title: "Alterado" }));
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_gallery_update_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.entity_id='${gallery}' AND NEW.action='client_gallery.updated' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await update()).status).toBe(500);
      expect(await env.DB.prepare("SELECT * FROM client_galleries WHERE id=?").bind(gallery).first()).toEqual(before);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_gallery_update_audit_failure").run();
    }
    expect((await update()).status).toBe(200);
    expect(await env.DB.prepare("SELECT title FROM client_galleries WHERE id=?").bind(gallery).first()).toEqual({ title: "Alterado" });
    expect(await env.DB.prepare("SELECT action FROM audit_log WHERE entity_id=? AND action='client_gallery.updated'").bind(gallery).first())
      .toEqual({ action: "client_gallery.updated" });
  }, 60_000);
  it("rolls back Clerk link and unlink changes when their audit insert fails", async () => {
    const client = await seedClient();
    const clerkUserId = `user_${crypto.randomUUID().replaceAll("-", "")}`;
    const link = () => {
      const request = privateRequest(`/admin/api/clientes/${client}/clerk-link`, "PUT", { clerkUserId });
      return handlePrivateGalleryRoutes(request, new URL(request.url), env);
    };
    const unlink = () => {
      const request = privateRequest(`/admin/api/clientes/${client}/clerk-link`, "DELETE", {});
      return handlePrivateGalleryRoutes(request, new URL(request.url), env);
    };
    const beforeAccount = await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first();
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_clerk_link_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.entity_id='${client}' AND NEW.action='client.clerk_linked' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await link())?.status).toBe(500);
      expect(await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first()).toEqual(beforeAccount);
      expect(await env.DB.prepare("SELECT * FROM clerk_pilot_identity_links WHERE client_id=?").bind(client).first()).toBeNull();
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_clerk_link_audit_failure").run();
    }
    expect((await link())?.status).toBe(200);
    const linked = await env.DB.prepare("SELECT * FROM clerk_pilot_identity_links WHERE client_id=?").bind(client).first();
    expect(linked?.clerk_user_id).toBe(clerkUserId);
    const linkEvent = await env.DB.prepare("SELECT data_json FROM audit_log WHERE entity_id=? AND action='client.clerk_linked'").bind(client).first<{ data_json: string }>();
    expect(JSON.parse(linkEvent!.data_json)).toEqual({ clerkUserId, sessionVersion: beforeAccount?.session_version });
    const beforeUnlinkAccount = await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first();
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_clerk_unlink_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.entity_id='${client}' AND NEW.action='client.clerk_unlinked' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await unlink())?.status).toBe(500);
      expect(await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first()).toEqual(beforeUnlinkAccount);
      expect(await env.DB.prepare("SELECT * FROM clerk_pilot_identity_links WHERE client_id=?").bind(client).first()).toEqual(linked);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_clerk_unlink_audit_failure").run();
    }
    expect((await unlink())?.status).toBe(200);
    expect(await env.DB.prepare("SELECT * FROM clerk_pilot_identity_links WHERE client_id=?").bind(client).first()).toBeNull();
    expect(await env.DB.prepare("SELECT session_version FROM client_accounts WHERE id=?").bind(client).first())
      .toEqual({ session_version: (beforeUnlinkAccount?.session_version as number) + 1 });
    expect(await env.DB.prepare("SELECT actor_email,action,data_json FROM audit_log WHERE entity_id=? AND action='client.clerk_unlinked'").bind(client).first())
      .toEqual({ actor_email: "maria.helena@local.dev", action: "client.clerk_unlinked", data_json: '{"unlinked":true}' });
  }, 60_000);
  it.each([true, false])("rolls back client disable=%s when its audit insert fails and retries exactly once", async (disabled) => {
    const client = await seedClient();
    if (!disabled)
      await env.DB.prepare("UPDATE client_accounts SET disabled_at='2026-11-21T00:00:00.000Z',session_version=7 WHERE id=?").bind(client).run();
    const before = await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first();
    const action = disabled ? "client.disabled" : "client.enabled";
    const toggle = () => exports.default.fetch(privateRequest(`/admin/api/clientes/${client}`, "PATCH", { disabled }));
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_client_toggle_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.entity_id='${client}' AND NEW.action='${action}' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await toggle()).status).toBe(500);
      expect(await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first()).toEqual(before);
      expect(await env.DB.prepare("SELECT id FROM audit_log WHERE entity_id=? AND action=?").bind(client, action).first()).toBeNull();
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_client_toggle_audit_failure").run();
    }
    const retry = await toggle();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true });
    const after = await env.DB.prepare("SELECT * FROM client_accounts WHERE id=?").bind(client).first();
    expect(after).toEqual({
      ...before,
      disabled_at: disabled ? expect.any(String) : null,
      session_version: (before?.session_version as number) + 1,
      updated_at: expect.any(String),
    });
    const events = await env.DB.prepare("SELECT actor_email,action,entity_type,entity_id,data_json,created_at FROM audit_log WHERE entity_id=? AND action=?").bind(client, action).all();
    expect(events.results).toEqual([{
      actor_email: "maria.helena@local.dev",
      action,
      entity_type: "client_account",
      entity_id: client,
      data_json: null,
      created_at: expect.any(String),
    }]);
  }, 60_000);
  it.each(["archive", "unpublish"] as const)("rolls back %s when its audit insert fails", async (action) => {
    const gallery = await seedGallery(await seedClient(), "published");
    const before = await env.DB.prepare("SELECT status,updated_at FROM client_galleries WHERE id=?").bind(gallery).first();
    await env.DB.prepare(`CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_log
      WHEN NEW.entity_id='${gallery}' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
    try {
      const response = await exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}/${action}`, "POST", {}));
      expect(response.status).toBe(500);
      expect(await env.DB.prepare("SELECT status,updated_at FROM client_galleries WHERE id=?").bind(gallery).first()).toEqual(before);
      expect(await env.DB.prepare("SELECT id FROM audit_log WHERE entity_id=?").bind(gallery).first()).toBeNull();
    } finally {
      await env.DB.prepare("DROP TRIGGER synthetic_audit_failure").run();
    }
    const retry = await exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}/${action}`, "POST", {}));
    expect(retry.status).toBe(200);
    expect(await env.DB.prepare("SELECT status FROM client_galleries WHERE id=?").bind(gallery).first())
      .toEqual({ status: action === "archive" ? "archived" : "draft" });
    expect(await env.DB.prepare("SELECT actor_email,action FROM audit_log WHERE entity_id=?").bind(gallery).first())
      .toEqual({ actor_email: "maria.helena@local.dev", action: "client_gallery." + action });
  }, 60_000);
  it("records successful reorder without copying photograph metadata into the audit", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const first = await seedReadyImage(gallery); const second = await seedReadyImage(gallery);
    const response = await exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}/order`, "PUT", { imageIds: [second, first] }));
    expect(response.status).toBe(200);
    const event = await env.DB.prepare("SELECT actor_email FROM audit_log WHERE entity_id=? AND action='client_gallery.images_reordered'").bind(gallery).first();
    expect(event).toEqual({ actor_email: "maria.helena@local.dev" });
  }, 60_000); // Worker startup plus D1 audit write exceeds the 20s default on the shared Linux runner.
  it("records a pending upload intent so abandoned administrative uploads are attributable", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const response = await exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/intents`, "POST", { filename: "synthetic.png", mimeType: "image/png", sizeBytes: 80, sha256: "0".repeat(64) }));
    expect(response.status).toBe(201);
    const event = await env.DB.prepare("SELECT actor_email FROM audit_log WHERE entity_id=? AND action='client_gallery.upload_intent_created'").bind(gallery).first();
    expect(event).toEqual({ actor_email: "maria.helena@local.dev" });
  });
  it("rolls back pending upload image and intent when their audit insert fails, then retries", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const counts = () => env.DB.prepare("SELECT (SELECT COUNT(*) FROM client_gallery_images WHERE gallery_id=?) AS images,(SELECT COUNT(*) FROM client_gallery_upload_intents WHERE gallery_id=?) AS intents")
      .bind(gallery, gallery).first();
    const before = await counts();
    const create = () => exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/intents`, "POST", {
      filename: "retry.png", mimeType: "image/png", sizeBytes: 80, sha256: "1".repeat(64),
    }));
    try {
      await env.DB.prepare(`CREATE TRIGGER synthetic_upload_intent_audit_failure BEFORE INSERT ON audit_log
        WHEN NEW.entity_id='${gallery}' AND NEW.action='client_gallery.upload_intent_created' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;`).run();
      expect((await create()).status).toBe(500);
      expect(await counts()).toEqual(before);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS synthetic_upload_intent_audit_failure").run();
    }
    const retry = await create();
    expect(retry.status).toBe(201);
    expect(await counts()).toEqual({ images: 1, intents: 1 });
    expect(await env.DB.prepare("SELECT actor_email,action FROM audit_log WHERE entity_id=? AND action='client_gallery.upload_intent_created'").bind(gallery).first())
      .toEqual({ actor_email: "maria.helena@local.dev", action: "client_gallery.upload_intent_created" });
  }, 60_000);
});
