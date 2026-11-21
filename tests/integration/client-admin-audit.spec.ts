import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb, privateRequest, seedClient, seedGallery, seedReadyImage } from "./client-fixture";

describe("private administrative state changes have an attributed audit event", () => {
  beforeAll(bootstrapPrivateDb);
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
});
