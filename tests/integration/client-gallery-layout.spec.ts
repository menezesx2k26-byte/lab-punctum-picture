import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { handlePrivateGalleryRoutes } from "../../worker/client/router";
import { getGallery } from "../../worker/client/repository";
import { bootstrapPrivateDb, privateRequest, seedClient, seedGallery } from "./client-fixture";

describe("private album template persistence and safety", () => {
  beforeAll(bootstrapPrivateDb);
  it("updates the chosen template atomically without altering ownership or publication", async () => {
    const clientId = await seedClient();
    const galleryId = await seedGallery(clientId, "draft");
    const before = await getGallery(env.DB, galleryId);
    const req = privateRequest("/admin/api/albuns-privados/" + galleryId, "PATCH", { layoutPreset: "colagem" });
    const response = await handlePrivateGalleryRoutes(req, new URL(req.url), env);
    expect(response?.status).toBe(200);
    expect((await response?.json() as { gallery: { layoutPreset: string } }).gallery.layoutPreset).toBe("colagem");
    const after = await getGallery(env.DB, galleryId);
    expect(after?.layoutPreset).toBe("colagem");
    expect(after?.clientId).toBe(clientId);
    expect(after?.status).toBe("draft");
    expect(after?.coverImageId).toBe(before?.coverImageId);
    expect(after?.allowDownloads).toBe(before?.allowDownloads);
  });
  it("rejects arbitrary HTML/CSS template identifiers and keeps the prior selection", async () => {
    const galleryId = await seedGallery(await seedClient(), "draft");
    const req = privateRequest("/admin/api/albuns-privados/" + galleryId, "PATCH", { layoutPreset: "<script>" });
    const response = await handlePrivateGalleryRoutes(req, new URL(req.url), env);
    expect(response?.status).toBe(400);
    expect((await getGallery(env.DB, galleryId))?.layoutPreset).toBe("classico");
  });
});
