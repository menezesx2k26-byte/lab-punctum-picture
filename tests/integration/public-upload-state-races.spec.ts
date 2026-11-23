import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { handleAdminApi } from "../../worker/api/admin";
import { bootstrapPrivateDb } from "./client-fixture";

beforeAll(bootstrapPrivateDb);

async function reservation() {
  const albumId = crypto.randomUUID();
  const imageId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const key = `originals/${albumId}/${imageId}.png`;
  await env.DB.prepare(
    `INSERT INTO albums(id,slug,title,status,created_at,updated_at)
     VALUES (?,?, 'Synthetic public upload', 'draft', datetime('now'), datetime('now'))`,
  ).bind(albumId, albumId).run();
  await env.DB.prepare(
    `INSERT INTO images(id,album_id,original_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at)
     VALUES (?,?,?,'test.png','image/png',?,?, 'pending',datetime('now'),datetime('now'))`,
  ).bind(imageId, albumId, key, 3, 0).run();
  await env.DB.prepare(
    `INSERT INTO upload_intents(id,album_id,image_id,object_key,original_filename,expected_mime,expected_size,
      status,created_by,expires_at,created_at)
     VALUES (?,?,?,?,'test.png','image/png',3,'pending','synthetic-qa',?,datetime('now'))`,
  ).bind(intentId, albumId, imageId, key, new Date(Date.now()+3_600_000).toISOString()).run();
  return { albumId, imageId, intentId, key };
}

function adminUpload(intentId: string, type: "direct" | "complete") {
  return new Request(`http://localhost:8787/admin/api/uploads/${intentId}/${type}`, {
    method: type === "direct" ? "PUT" : "POST",
    headers: { Origin: "http://localhost:8787", "Content-Type": type === "direct" ? "image/png" : "application/json" },
    body: type === "direct" ? Uint8Array.of(1,2,3) : "{}",
  });
}

function bucketWithPutHook(hook: () => Promise<void>, calls: { count: number }) {
  return new Proxy(env.ORIGINALS, {
    get(target, prop) {
      if (prop === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        calls.count++;
        const value = await target.put(...args);
        await hook();
        return value;
      };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

describe("public Studio upload D1/R2 state and restore conflicts", () => {
  it("rejects a restored ready image before R2 PUT when it changes after the intent read", async () => {
    const row = await reservation();
    const calls = { count: 0 };
    let changed = 0;
    const db = {
      prepare(sql: string) {
        const statement = env.DB.prepare(sql);
        if (!sql.includes("FROM upload_intents WHERE id = ?")) return statement;
        return {
          bind(...args: Parameters<typeof statement.bind>) {
            const bound = statement.bind(...args);
            return { async first() {
              const result = await bound.first();
              if (++changed === 1) await env.DB.prepare("UPDATE images SET status='ready' WHERE id=?")
                .bind(row.imageId).run();
              return result;
            } };
          },
        } as unknown as typeof statement;
      },
    } as unknown as D1Database;
    const bindings = { ...env, DB: db, ORIGINALS: bucketWithPutHook(async () => {}, calls) } as Env;
    const request = adminUpload(row.intentId, "direct");
    await expect(handleAdminApi(request, new URL(request.url), bindings))
      .rejects.toMatchObject({status:409});
    expect(changed).toBeGreaterThan(0);
    expect(calls.count, "known restored image must never trigger R2 PUT").toBe(0);
    expect(await env.ORIGINALS.head(row.key)).toBeNull();
  });

  it("does not revive an expired intent if cleanup wins immediately after R2 PUT", async () => {
    const row = await reservation();
    const calls = { count: 0 };
    const bucket = bucketWithPutHook(async () => {
      await env.DB.prepare("UPDATE upload_intents SET status='expired' WHERE id=?")
        .bind(row.intentId).run();
      await env.DB.prepare("UPDATE images SET status='failed' WHERE id=?")
        .bind(row.imageId).run();
    }, calls);
    const request = adminUpload(row.intentId, "direct");
    await expect(handleAdminApi(request, new URL(request.url), { ...env, ORIGINALS: bucket } as Env))
      .rejects.toMatchObject({status:409});
    expect(calls.count).toBe(1);
    expect(await env.DB.prepare("SELECT status FROM upload_intents WHERE id=?")
      .bind(row.intentId).first()).toEqual({status:"expired"});
    expect(await env.DB.prepare("SELECT status FROM images WHERE id=?")
      .bind(row.imageId).first()).toEqual({status:"failed"});
    expect(await env.ORIGINALS.head(row.key), "late written original stays recoverable").not.toBeNull();
  });

  it("never completes an uploaded intent if its image is revoked while inspecting bytes", async () => {
    const row = await reservation();
    await env.DB.prepare("UPDATE upload_intents SET status='uploaded' WHERE id=?")
      .bind(row.intentId).run();
    await env.ORIGINALS.put(row.key, Uint8Array.of(1,2,3), {httpMetadata:{contentType:"image/png"}});
    const bindings = { ...env, IMAGES: {
      async info() {
        await env.DB.prepare("UPDATE images SET deleted_at='2026-11-09' WHERE id=?")
          .bind(row.imageId).run();
        await env.DB.prepare("UPDATE upload_intents SET status='expired' WHERE id=?")
          .bind(row.intentId).run();
        return {format:"image/png",fileSize:3,width:2,height:2};
      },
    } } as unknown as Env;
    const request = adminUpload(row.intentId, "complete");
    await expect(handleAdminApi(request, new URL(request.url), bindings))
      .rejects.toMatchObject({status:409});
    expect(await env.DB.prepare("SELECT status,deleted_at AS deletedAt FROM images WHERE id=?")
      .bind(row.imageId).first()).toEqual({status:"pending", deletedAt:"2026-11-09"});
    expect(await env.DB.prepare("SELECT status FROM upload_intents WHERE id=?")
      .bind(row.intentId).first()).toEqual({status:"expired"});
    expect(await env.ORIGINALS.head(row.key)).not.toBeNull();
  });

  it("does not mark an invalid raster ready after Images decoding rejects its bytes", async () => {
    const row = await reservation();
    await env.DB.prepare("UPDATE upload_intents SET status='uploaded' WHERE id=?")
      .bind(row.intentId).run();
    await env.ORIGINALS.put(row.key, Uint8Array.of(1,2,3), {httpMetadata:{contentType:"image/png"}});
    const request = adminUpload(row.intentId, "complete");
    await expect(handleAdminApi(request, new URL(request.url), env as Env))
      .rejects.toMatchObject({status:409});
    expect(await env.DB.prepare("SELECT status FROM images WHERE id=?")
      .bind(row.imageId).first()).toEqual({status:"pending"});
    expect(await env.DB.prepare("SELECT status FROM upload_intents WHERE id=?")
      .bind(row.intentId).first()).toEqual({status:"uploaded"});
    expect(await env.ORIGINALS.head(row.key)).not.toBeNull();
  });
});
