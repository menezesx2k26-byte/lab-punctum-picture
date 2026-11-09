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

it("never reads R2 or calls Images for legacy oversized intents already persisted in D1", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const image = await seedReadyImage(gallery);
  const key = (await env.DB.prepare("SELECT storage_key AS key FROM client_gallery_images WHERE id=?")
    .bind(image).first<{key:string}>())!.key;
  const id = crypto.randomUUID();
  const oversized = 26_214_400;
  await env.DB.prepare(`INSERT INTO client_gallery_upload_intents
    (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at,sha256)
    VALUES (?,?,?,'image/png',?,?,'uploaded',?,datetime('now'),?)`)
    .bind(id,gallery,image,oversized,key,new Date(Date.now()+3600000).toISOString(),"a".repeat(64)).run();
  const lockedBucket = new Proxy(env.ORIGINALS, {
    get(target,key) {
      if (["put","head","get"].includes(String(key)))
        return () => { throw new Error("oversized original must not reach R2"); };
      const value=Reflect.get(target,key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const forbiddenImages = {
    info: () => { throw new Error("oversized original must not reach Images.info"); },
    input: () => { throw new Error("oversized original must not reach Images.input"); },
  };
  for (const method of ["PUT", "POST"] as const) {
    const action = method === "PUT" ? "direct" : "complete";
    const path = `/admin/api/albuns-privados/${gallery}/uploads/${id}/${action}`;
    const request = privateRequest(path, method);
    await expect(handleClientGalleryUploadApi(request,new URL(request.url),
      {...env,ORIGINALS:lockedBucket,IMAGES:forbiddenImages} as unknown as Env))
      .rejects.toMatchObject({status:413,code:"UPLOAD_IMAGE_LIMIT"});
  }
  expect(await env.DB.prepare("SELECT status,sha256 FROM client_gallery_upload_intents WHERE id=?")
    .bind(id).first()).toEqual({status:"uploaded",sha256:"a".repeat(64)});
});

it("rejects restored upload intents with mismatched R2 key or image metadata before storage", async () => {
  const forbiddenR2 = new Proxy(env.ORIGINALS, {
    get(target,key) {
      if (["get","put","head","delete"].includes(String(key)))
        return () => { throw new Error("mismatched intent must never access R2"); };
      const value=Reflect.get(target,key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const forbiddenImages = {
    info: () => { throw new Error("mismatched intent must not reach Images"); },
    input: () => { throw new Error("mismatched intent must not reach Images"); },
  };
  for (const scenario of ["foreign-key", "other-key", "wrong-size", "wrong-mime"]) {
    const gallery = await seedGallery(await seedClient(), "draft");
    const imageId = await seedReadyImage(gallery);
    const image = (await env.DB.prepare("SELECT storage_key AS key FROM client_gallery_images WHERE id=?")
      .bind(imageId).first<{key:string}>())!;
    const invalid = scenario === "foreign-key"
      ? { key: `client-galleries/${crypto.randomUUID()}/foreign.png`, size: 1, mime: "image/png" }
      : scenario === "other-key"
        ? { key: `client-galleries/${gallery}/${crypto.randomUUID()}.png`, size: 1, mime: "image/png" }
        : scenario === "wrong-size"
          ? { key: image.key, size: 2, mime: "image/png" }
          : { key: image.key, size: 1, mime: "image/jpeg" };
    const intentId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO client_gallery_upload_intents
      (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at,sha256)
      VALUES (?,?,?,?,?,?,'uploaded',?,datetime('now'),?)`)
      .bind(intentId,gallery,imageId,invalid.mime,invalid.size,invalid.key,
        new Date(Date.now()+3_600_000).toISOString(),"a".repeat(64)).run();
    for (const [method,action] of [["PUT","direct"],["POST","complete"]] as const) {
      const path=`/admin/api/albuns-privados/${gallery}/uploads/${intentId}/${action}`;
      const request=privateRequest(path,method);
      await expect(handleClientGalleryUploadApi(request,new URL(request.url),
        {...env, ORIGINALS:forbiddenR2, IMAGES:forbiddenImages} as unknown as Env))
        .rejects.toMatchObject({status:409,code:"UPLOAD_INTENT_MISMATCH"});
    }
    expect(await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?")
      .bind(intentId).first()).toEqual({status:"uploaded"});
  }
});
it("blocks a signed direct upload when a concurrent restore promotes the image after the first D1 ownership read", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const bytes = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),
    (c) => c.charCodeAt(0),
  );
  const intentPath = `/admin/api/albuns-privados/${gallery}/uploads/intents`;
  const intentRequest = privateRequest(intentPath, "POST", {
    filename: "race.png", mimeType: "image/png", sizeBytes: bytes.length,
  });
  const result = await handleClientGalleryUploadApi(intentRequest, new URL(intentRequest.url), env);
  expect(result?.status).toBe(201);
  const reservation = await result!.json() as {
    intentId: string; imageId: string; uploadUrl: string;
    requiredHeaders: Record<string, string>;
  };
  let raced = false;
  const db = {
    prepare(sql: string) {
      const statement = env.DB.prepare(sql);
      if (!sql.includes("SELECT storage_key AS storageKey, mime_type AS mimeType,"))
        return statement;
      return {
        bind(...args: Parameters<typeof statement.bind>) {
          const bound = statement.bind(...args);
          return {
            async first() {
              const image = await bound.first();
              if (!raced) {
                raced = true;
                await env.DB.prepare("UPDATE client_gallery_images SET status='ready' WHERE id=?")
                  .bind(reservation.imageId).run();
              }
              return image;
            },
          };
        },
      } as unknown as typeof statement;
    },
  } as unknown as D1Database;
  let puts = 0;
  const originals = new Proxy(env.ORIGINALS, {
    get(target, property) {
      if (property === "put") return () => {
        puts++;
        throw new Error("R2 PUT reached after restore promoted image ready");
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const upload = new Request(reservation.uploadUrl, {
    method: "PUT",
    headers: {
      ...reservation.requiredHeaders,
      Origin: "http://localhost:8787",
      "Content-Length": String(bytes.length),
    },
    body: bytes.slice().buffer,
  });
  await expect(handleClientGalleryUploadApi(upload, new URL(upload.url),
    { ...env, DB: db, ORIGINALS: originals } as Env))
    .rejects.toMatchObject({ status: 409, code: "UPLOAD_INTENT_MISMATCH" });
  expect(raced).toBe(true);
  expect(puts).toBe(0);
  expect((await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?")
    .bind(reservation.imageId).first())?.status).toBe("ready");
  expect((await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?")
    .bind(reservation.intentId).first())?.status).toBe("pending");
  const storageKey = (await env.DB.prepare("SELECT storage_key AS storageKey FROM client_gallery_images WHERE id=?")
    .bind(reservation.imageId).first<{ storageKey: string }>())!.storageKey;
  expect(await env.ORIGINALS.head(storageKey)).toBeNull();
});

it("refuses replay of an upload token after a coherent D1 image/key rebind", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const bytes = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),
    (c) => c.charCodeAt(0),
  );
  const create = privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/intents`, "POST", {
    filename: "first.png", mimeType: "image/png", sizeBytes: bytes.length,
  });
  const result = await handleClientGalleryUploadApi(create, new URL(create.url), env);
  expect(result?.status).toBe(201);
  const issued = await result!.json() as {
    intentId: string; imageId: string; uploadUrl: string;
    requiredHeaders: Record<string, string>;
  };
  // A recovered or concurrently tampered D1 row can remain internally
  // canonical while rebinding this intent to another image. The original
  // bearer token must not authorize R2 writes for a different image/key.
  const alternate = await seedReadyImage(gallery);
  const alternateKey = `client-galleries/${gallery}/${alternate}.png`;
  await env.DB.prepare(
    "UPDATE client_gallery_images SET status='pending',size_bytes=? WHERE id=?",
  ).bind(bytes.length, alternate).run();
  await env.DB.prepare(
    "UPDATE client_gallery_upload_intents SET image_id=?,storage_key=? WHERE id=?",
  ).bind(alternate, alternateKey, issued.intentId).run();

  let puts = 0;
  const guardedR2 = new Proxy(env.ORIGINALS, {
    get(target, property) {
      if (property === "put") return () => {
        puts++;
        throw new Error("R2 PUT reached with replayed token bound to another image");
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const upload = new Request(issued.uploadUrl, {
    method: "PUT",
    headers: {
      ...issued.requiredHeaders,
      Origin: "http://localhost:8787",
      "Content-Length": String(bytes.length),
    },
    body: bytes.slice().buffer,
  });
  await expect(handleClientGalleryUploadApi(upload, new URL(upload.url),
    { ...env, ORIGINALS: guardedR2 } as Env))
    .rejects.toMatchObject({ status: 403, code: "UPLOAD_SIGNATURE" });
  expect(puts).toBe(0);
  expect(await env.ORIGINALS.head(alternateKey)).toBeNull();
  expect((await env.DB.prepare(
    "SELECT status,image_id AS imageId FROM client_gallery_upload_intents WHERE id=?",
  ).bind(issued.intentId).first())).toEqual({ status: "pending", imageId: alternate });
});
