import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { bootstrapPrivateDb, privateRequest, seedClient, seedGallery, seedReadyImage } from "./client-fixture";
import { handleClientGalleryUploadApi } from "../../worker/api/client-gallery-upload";

beforeAll(bootstrapPrivateDb);
it("refuses new upload intents before creating gallery rows when image validation is unavailable", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const request = privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/intents`, "POST", {
    filename: "foto.png",
    mimeType: "image/png",
    sizeBytes: 80,
  });
  await expect(handleClientGalleryUploadApi(request, new URL(request.url), {
    ...env,
    IMAGES: undefined,
  } as unknown as Env)).rejects.toMatchObject({
    status: 503,
    code: "IMAGE_VALIDATION_UNAVAILABLE",
  });
  const intents = await env.DB.prepare("SELECT COUNT(*) AS total FROM client_gallery_upload_intents WHERE gallery_id=?")
    .bind(gallery).first<{total:number}>();
  const images = await env.DB.prepare("SELECT COUNT(*) AS total FROM client_gallery_images WHERE gallery_id=?")
    .bind(gallery).first<{total:number}>();
  expect(intents?.total).toBe(0);
  expect(images?.total).toBe(0);
});
it("reports missing image validation as a service failure without falsely marking a valid upload corrupted", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const image = await seedReadyImage(gallery);
  const intent = crypto.randomUUID();
  const key = (await env.DB.prepare("SELECT storage_key AS key FROM client_gallery_images WHERE id=?").bind(image).first<{key:string}>())!.key;
  const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map(part => part.toString(16).padStart(2,"0")).join("");
  await env.ORIGINALS.put(key, bytes, { httpMetadata: { contentType: "image/png" }, customMetadata:{sha256:digest} });
  await env.DB.prepare("UPDATE client_gallery_images SET status='pending',size_bytes=? WHERE id=?").bind(bytes.length,image).run();
  await env.DB.prepare("INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at,sha256) VALUES (?,?,?,'image/png',?,?,'uploaded',?,datetime('now'),?)").bind(intent,gallery,image,bytes.length,key,new Date(Date.now()+3_600_000).toISOString(),digest).run();
  const request = privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/${intent}/complete`, "POST");
  await expect(handleClientGalleryUploadApi(request,new URL(request.url),{...env,IMAGES:undefined} as unknown as Env)).rejects.toMatchObject({status:503,code:"IMAGE_VALIDATION_UNAVAILABLE"});
  expect((await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?").bind(intent).first())?.status).toBe("uploaded");
  expect((await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?").bind(image).first())?.status).toBe("pending");
});

it("keeps an uploaded original recoverable when Images responds 503 during completion", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const image = await seedReadyImage(gallery);
  const intent = crypto.randomUUID();
  const key = (await env.DB.prepare("SELECT storage_key AS key FROM client_gallery_images WHERE id=?").bind(image).first<{key:string}>())!.key;
  const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),c=>c.charCodeAt(0));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map(part => part.toString(16).padStart(2,"0")).join("");
  await env.ORIGINALS.put(key,bytes,{httpMetadata:{contentType:"image/png"},customMetadata:{sha256:digest}});
  await env.DB.prepare("UPDATE client_gallery_images SET status='pending',size_bytes=? WHERE id=?").bind(bytes.length,image).run();
  await env.DB.prepare("INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at,sha256) VALUES (?,?,?,'image/png',?,?,'uploaded',?,datetime('now'),?)")
    .bind(intent,gallery,image,bytes.length,key,new Date(Date.now()+3_600_000).toISOString(),digest).run();
  const request=privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/${intent}/complete`,"POST");
  const brokenImages={
    info: async()=>({width:2,height:2}),
    input:()=>({transform:()=>({output:()=>({response:async()=>new Response("unavailable",{status:503})})})}),
  };
  await expect(handleClientGalleryUploadApi(request,new URL(request.url),{...env,IMAGES:brokenImages} as unknown as Env))
    .rejects.toMatchObject({status:503,code:"IMAGE_VALIDATION_UNAVAILABLE"});
  expect((await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?").bind(intent).first())?.status).toBe("uploaded");
  expect((await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?").bind(image).first())?.status).toBe("pending");
  expect(new Uint8Array(await (await env.ORIGINALS.get(key))!.arrayBuffer())).toEqual(bytes);
  const resumed=await handleClientGalleryUploadApi(privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/${intent}/complete`,"POST"),new URL(request.url),env);
  expect(resumed?.status).toBe(200);
  expect((await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?").bind(intent).first())?.status).toBe("completed");
  expect((await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?").bind(image).first())?.status).toBe("ready");
  expect(new Uint8Array(await (await env.ORIGINALS.get(key))!.arrayBuffer())).toEqual(bytes);
});

it("rejects photos over the 20 MB Images Binding input limit before any D1 reservation or R2 put", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  for (const sizeBytes of [20_000_001, 26_214_400]) {
    const request = privateRequest("/admin/api/albuns-privados/" + gallery + "/uploads/intents", "POST", {
      filename: "too-large-for-images-binding.png",
      mimeType: "image/png",
      sizeBytes,
    });
    await expect(handleClientGalleryUploadApi(request, new URL(request.url), env))
      .rejects.toMatchObject({status:400});
  }
  expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM client_gallery_images WHERE gallery_id=?")
    .bind(gallery).first<{n:number}>())?.n).toBe(0);
  expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM client_gallery_upload_intents WHERE gallery_id=?")
    .bind(gallery).first<{n:number}>())?.n).toBe(0);
});
