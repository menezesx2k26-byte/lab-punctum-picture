import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb, privateRequest, seedClient, seedGallery, seedReadyImage } from "./client-fixture";

describe("private administrative state changes have an attributed audit event", () => {
  beforeAll(bootstrapPrivateDb);
  it("records successful reorder without copying photograph metadata into the audit", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const first = await seedReadyImage(gallery); const second = await seedReadyImage(gallery);
    const response = await exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}/order`, "PUT", { imageIds: [second, first] }));
    expect(response.status).toBe(200);
    const event = await env.DB.prepare("SELECT actor_email FROM audit_log WHERE entity_id=? AND action='client_gallery.images_reordered'").bind(gallery).first();
    expect(event).toEqual({ actor_email: "maria.helena@local.dev" });
  });
  it("records a pending upload intent so abandoned administrative uploads are attributable", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const response = await exports.default.fetch(privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/intents`, "POST", { filename: "synthetic.png", mimeType: "image/png", sizeBytes: 80 }));
    expect(response.status).toBe(201);
    const event = await env.DB.prepare("SELECT actor_email FROM audit_log WHERE entity_id=? AND action='client_gallery.upload_intent_created'").bind(gallery).first();
    expect(event).toEqual({ actor_email: "maria.helena@local.dev" });
  });
});
