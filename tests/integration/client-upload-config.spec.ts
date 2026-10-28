import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { bootstrapPrivateDb, privateRequest, seedClient, seedGallery, seedReadyImage } from "./client-fixture";
import { handleClientGalleryUploadApi } from "../../worker/api/client-gallery-upload";

beforeAll(bootstrapPrivateDb);
it("reports missing image validation as a service failure without falsely marking a valid upload corrupted", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const image = await seedReadyImage(gallery);
  const intent = crypto.randomUUID();
  const key = (await env.DB.prepare("SELECT storage_key AS key FROM client_gallery_images WHERE id=?").bind(image).first<{key:string}>())!.key;
  const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
  await env.ORIGINALS.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
  await env.DB.prepare("UPDATE client_gallery_images SET status='pending',size_bytes=? WHERE id=?").bind(bytes.length,image).run();
  await env.DB.prepare("INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at) VALUES (?,?,?,'image/png',?,?,'uploaded',datetime('now','+1 hour'),datetime('now'))").bind(intent,gallery,image,bytes.length,key).run();
  const request = privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/${intent}/complete`, "POST");
  await expect(handleClientGalleryUploadApi(request,new URL(request.url),{...env,IMAGES:undefined} as unknown as Env)).rejects.toMatchObject({status:503,code:"IMAGE_VALIDATION_UNAVAILABLE"});
  expect((await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?").bind(intent).first())?.status).toBe("uploaded");
  expect((await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?").bind(image).first())?.status).toBe("pending");
});
