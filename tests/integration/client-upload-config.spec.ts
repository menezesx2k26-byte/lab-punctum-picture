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

it("rejects an authenticated upload flooded with empty stream chunks without writing R2", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const bytes = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),
    c => c.charCodeAt(0),
  );
  const reserve = privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/intents`,
    "POST", { filename: "flood.png", mimeType: "image/png", sizeBytes: bytes.length });
  const issued = await handleClientGalleryUploadApi(reserve, new URL(reserve.url), env);
  expect(issued?.status).toBe(201);
  const intent = await issued!.json() as {
    intentId: string; imageId: string; uploadUrl: string;
    requiredHeaders: Record<string, string>;
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < 65; i++) controller.enqueue(new Uint8Array(0));
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const upload = new Request(intent.uploadUrl, {
    method: "PUT", body,
    headers: { ...intent.requiredHeaders, Origin: "http://localhost:8787",
      "Content-Length": String(bytes.length) },
  });
  await expect(handleClientGalleryUploadApi(upload, new URL(upload.url), env))
    .rejects.toMatchObject({ status: 400, code: "UPLOAD_STREAM" });
  expect(await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?")
    .bind(intent.intentId).first()).toEqual({ status: "pending" });
  const key = await env.DB.prepare("SELECT storage_key AS key FROM client_gallery_images WHERE id=?")
    .bind(intent.imageId).first<{key:string}>();
  expect(await env.ORIGINALS.head(key!.key)).toBeNull();
});

it("preserves the signed intent when an invalid stream also rejects cancellation", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const bytes = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),
    c => c.charCodeAt(0),
  );
  const reserve = privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/intents`,
    "POST", { filename: "cancellation.png", mimeType: "image/png", sizeBytes: bytes.length });
  const issued = await handleClientGalleryUploadApi(reserve, new URL(reserve.url), env);
  const intent = await issued!.json() as {
    intentId:string; imageId:string; uploadUrl:string; requiredHeaders:Record<string,string>;
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) { for (let i = 0; i < 65; i++) controller.enqueue(new Uint8Array(0)); },
    cancel() { throw new Error("simulated transport cancel rejection"); },
  });
  const request = new Request(intent.uploadUrl, { method: "PUT", body,
    headers: {...intent.requiredHeaders, Origin:"http://localhost:8787", "Content-Length":String(bytes.length)} });
  await expect(handleClientGalleryUploadApi(request, new URL(request.url), env))
    .rejects.toMatchObject({status:400, code:"UPLOAD_STREAM"});
  expect(await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?")
    .bind(intent.intentId).first()).toEqual({status:"pending"});
  const key = (await env.DB.prepare("SELECT storage_key AS key FROM client_gallery_images WHERE id=?")
    .bind(intent.imageId).first<{key:string}>())!.key;
  expect(await env.ORIGINALS.head(key)).toBeNull();
  const retry = new Request(intent.uploadUrl, {method:"PUT", body:bytes,
    headers:{...intent.requiredHeaders, Origin:"http://localhost:8787", "Content-Length":String(bytes.length)}});
  expect((await handleClientGalleryUploadApi(retry, new URL(retry.url), env))?.status).toBe(200);
});

it("rejects excessive nonempty upload fragments before R2 and allows a normal retry", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),
    c => c.charCodeAt(0),
  );
  const bytes = new Uint8Array(8_193);
  bytes.set(png);
  const reserve = privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/intents`,
    "POST", { filename: "fragments.png", mimeType: "image/png", sizeBytes: bytes.length });
  const issued = await handleClientGalleryUploadApi(reserve, new URL(reserve.url), env);
  expect(issued?.status).toBe(201);
  const intent = await issued!.json() as {
    intentId: string; imageId: string; uploadUrl: string;
    requiredHeaders: Record<string, string>;
  };
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset < bytes.length) controller.enqueue(bytes.subarray(offset++, offset));
      else controller.close();
    },
  });
  const headers = { ...intent.requiredHeaders, Origin: "http://localhost:8787",
    "Content-Length": String(bytes.length) };
  const upload = new Request(intent.uploadUrl, { method: "PUT", headers, body });
  await expect(handleClientGalleryUploadApi(upload, new URL(upload.url), env))
    .rejects.toMatchObject({status:400,code:"UPLOAD_STREAM"});
  expect(await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?")
    .bind(intent.intentId).first()).toEqual({status:"pending"});
  const key = (await env.DB.prepare("SELECT storage_key AS key FROM client_gallery_images WHERE id=?")
    .bind(intent.imageId).first<{key:string}>())!.key;
  expect(await env.ORIGINALS.head(key)).toBeNull();
  const retry = new Request(intent.uploadUrl, {method:"PUT",headers,body:bytes});
  expect((await handleClientGalleryUploadApi(retry,new URL(retry.url),env))?.status).toBe(200);
  expect(new Uint8Array(await (await env.ORIGINALS.get(key))!.arrayBuffer())).toEqual(bytes);
});

it("keeps an upload intent retryable after its incoming body stream aborts", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const bytes = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),
    c => c.charCodeAt(0),
  );
  const reserve = privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/intents`,
    "POST", { filename: "retry.png", mimeType: "image/png", sizeBytes: bytes.length });
  const issued = await handleClientGalleryUploadApi(reserve, new URL(reserve.url), env);
  const intent = await issued!.json() as {
    intentId: string; imageId: string; uploadUrl: string;
    requiredHeaders: Record<string, string>;
  };
  const headers = { ...intent.requiredHeaders, Origin: "http://localhost:8787",
    "Content-Length": String(bytes.length) };
  let pulled = 0;
  const broken = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (++pulled === 1) controller.enqueue(bytes.slice(0, 10));
      else controller.error(new Error("simulated transport interruption"));
    },
  });
  const interrupted = new Request(intent.uploadUrl, { method: "PUT", headers, body: broken });
  await expect(handleClientGalleryUploadApi(interrupted, new URL(interrupted.url), env))
    .rejects.toMatchObject({ status: 400, code: "UPLOAD_STREAM" });
  expect(await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?")
    .bind(intent.intentId).first()).toEqual({ status: "pending" });
  const key = (await env.DB.prepare("SELECT storage_key AS key FROM client_gallery_images WHERE id=?")
    .bind(intent.imageId).first<{key:string}>())!.key;
  expect(await env.ORIGINALS.head(key)).toBeNull();
  const retry = new Request(intent.uploadUrl, { method: "PUT", headers, body: bytes });
  expect((await handleClientGalleryUploadApi(retry, new URL(retry.url), env))?.status).toBe(200);
  expect(await env.DB.prepare("SELECT status FROM client_gallery_upload_intents WHERE id=?")
    .bind(intent.intentId).first()).toEqual({ status: "uploaded" });
  expect(new Uint8Array(await (await env.ORIGINALS.get(key))!.arrayBuffer())).toEqual(bytes);
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

it("does not publish an unrelated image when a restore rebinds the uploaded intent immediately before D1 completion", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const first = await seedReadyImage(gallery);
  const alternate = await seedReadyImage(gallery);
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),
    c => c.charCodeAt(0),
  );
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", png))]
    .map(x => x.toString(16).padStart(2, "0")).join("");
  const firstKey = `client-galleries/${gallery}/${first}.png`;
  const alternateKey = `client-galleries/${gallery}/${alternate}.png`;
  await env.DB.prepare("UPDATE client_gallery_images SET status='pending',size_bytes=? WHERE id IN (?,?)")
    .bind(png.length, first, alternate).run();
  await env.ORIGINALS.put(firstKey, png, {
    httpMetadata: { contentType: "image/png" }, customMetadata: { sha256: digest },
  });
  const intentId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO client_gallery_upload_intents
     (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at,sha256)
     VALUES (?,?,?,'image/png',?,?,'uploaded',?,datetime('now'),?)`,
  ).bind(intentId, gallery, first, png.length, firstKey,
    new Date(Date.now() + 600_000).toISOString(), digest).run();

  let rebinds = 0;
  const racingDb = new Proxy(env.DB, {
    get(target, key) {
      if (key === "batch") return async (statements: D1PreparedStatement[]) => {
        rebinds++;
        await env.DB.prepare(
          "UPDATE client_gallery_upload_intents SET image_id=?,storage_key=? WHERE id=?",
        ).bind(alternate, alternateKey, intentId).run();
        return target.batch(statements);
      };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const request = privateRequest(
    `/admin/api/albuns-privados/${gallery}/uploads/${intentId}/complete`, "POST",
  );
  await expect(handleClientGalleryUploadApi(request, new URL(request.url),
    { ...env, DB: racingDb } as Env))
    .rejects.toMatchObject({ status: 409, code: "UPLOAD_INTENT_MISMATCH" });
  expect(rebinds).toBe(1);
  expect(await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?")
    .bind(first).first()).toEqual({ status: "pending" });
  expect(await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?")
    .bind(alternate).first()).toEqual({ status: "pending" });
  expect(await env.DB.prepare(
    "SELECT status,image_id AS imageId FROM client_gallery_upload_intents WHERE id=?",
  ).bind(intentId).first()).toEqual({ status: "uploaded", imageId: alternate });
  expect(new Uint8Array(await (await env.ORIGINALS.get(firstKey))!.arrayBuffer())).toEqual(png);
  expect(await env.ORIGINALS.head(alternateKey)).toBeNull();
});

it("keeps a staged R2 original recoverable when a restore rebinds the intent after PUT but before D1 uploaded", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const bytes = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),
    c => c.charCodeAt(0),
  );
  const reserve = privateRequest(`/admin/api/albuns-privados/${gallery}/uploads/intents`,
    "POST", { filename: "staged.png", mimeType: "image/png", sizeBytes: bytes.length });
  const response = await handleClientGalleryUploadApi(reserve, new URL(reserve.url), env);
  expect(response?.status).toBe(201);
  const issued = await response!.json() as {
    intentId: string; imageId: string; uploadUrl: string;
    requiredHeaders: Record<string, string>;
  };
  const alternate = await seedReadyImage(gallery);
  const alternateKey = `client-galleries/${gallery}/${alternate}.png`;
  await env.DB.prepare("UPDATE client_gallery_images SET status='pending',size_bytes=? WHERE id=?")
    .bind(bytes.length, alternate).run();
  let staged = 0;
  const racingR2 = new Proxy(env.ORIGINALS, {
    get(target, key) {
      if (key === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        const result = await target.put(...args);
        staged++;
        await env.DB.prepare(
          "UPDATE client_gallery_upload_intents SET image_id=?,storage_key=? WHERE id=?",
        ).bind(alternate, alternateKey, issued.intentId).run();
        return result;
      };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const upload = new Request(issued.uploadUrl, {
    method: "PUT",
    headers: {
      ...issued.requiredHeaders, Origin: "http://localhost:8787",
      "Content-Length": String(bytes.length),
    },
    body: bytes.slice().buffer,
  });
  await expect(handleClientGalleryUploadApi(upload, new URL(upload.url),
    { ...env, ORIGINALS: racingR2 } as Env))
    .rejects.toMatchObject({ status: 409, code: "UPLOAD_INTENT_MISMATCH" });
  expect(staged).toBe(1);
  const firstKey = `client-galleries/${gallery}/${issued.imageId}.png`;
  expect(new Uint8Array(await (await env.ORIGINALS.get(firstKey))!.arrayBuffer())).toEqual(bytes);
  expect(await env.ORIGINALS.head(alternateKey)).toBeNull();
  expect(await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?")
    .bind(issued.imageId).first()).toEqual({ status: "pending" });
  expect(await env.DB.prepare(
    "SELECT status,image_id AS imageId FROM client_gallery_upload_intents WHERE id=?",
  ).bind(issued.intentId).first()).toEqual({ status: "pending", imageId: alternate });
});

it("does not mark another image failed if restore rebinds an intent during failed raster validation", async () => {
  const gallery = await seedGallery(await seedClient(), "draft");
  const first = await seedReadyImage(gallery);
  const alternate = await seedReadyImage(gallery);
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),
    c => c.charCodeAt(0),
  );
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", png))]
    .map(v => v.toString(16).padStart(2, "0")).join("");
  const key = `client-galleries/${gallery}/${first}.png`;
  const alternateKey = `client-galleries/${gallery}/${alternate}.png`;
  await env.DB.prepare("UPDATE client_gallery_images SET status='pending',size_bytes=? WHERE id IN (?,?)")
    .bind(png.length, first, alternate).run();
  await env.ORIGINALS.put(key, png, {
    httpMetadata: { contentType: "image/png" }, customMetadata: { sha256: sha },
  });
  const intent = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO client_gallery_upload_intents
    (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at,sha256)
    VALUES (?,?,?,'image/png',?,?,'uploaded',?,datetime('now'),?)`)
    .bind(intent, gallery, first, png.length, key, new Date(Date.now() + 600_000).toISOString(), sha).run();
  let raced = 0;
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === "batch") return async (statements: D1PreparedStatement[]) => {
        raced++;
        await env.DB.prepare(
          "UPDATE client_gallery_upload_intents SET image_id=?,storage_key=? WHERE id=?",
        ).bind(alternate, alternateKey, intent).run();
        return target.batch(statements);
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const invalidRaster = {
    info: async () => ({ width: 2, height: 2 }),
    input: () => ({
      transform: () => ({ output: () => ({ response: async () =>
        new Response("invalid raster", { status: 400 }) }) }),
    }),
  };
  const request = privateRequest(
    `/admin/api/albuns-privados/${gallery}/uploads/${intent}/complete`, "POST",
  );
  await expect(handleClientGalleryUploadApi(request, new URL(request.url),
    { ...env, DB: db, IMAGES: invalidRaster } as unknown as Env))
    .rejects.toMatchObject({ status: 409, code: "UPLOAD_INTENT_MISMATCH" });
  expect(raced).toBe(1);
  expect(await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?")
    .bind(first).first()).toEqual({ status: "pending" });
  expect(await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?")
    .bind(alternate).first()).toEqual({ status: "pending" });
  expect(await env.DB.prepare(
    "SELECT status,image_id AS imageId FROM client_gallery_upload_intents WHERE id=?",
  ).bind(intent).first()).toEqual({ status: "uploaded", imageId: alternate });
  expect(new Uint8Array(await (await env.ORIGINALS.get(key))!.arrayBuffer())).toEqual(png);
  expect(await env.ORIGINALS.head(alternateKey)).toBeNull();
});
