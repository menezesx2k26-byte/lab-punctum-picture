import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb, seedClient, seedGallery } from "./client-fixture";
import { cleanupPrivateGalleryUploads } from "../../worker/client/maintenance";

describe("private upload cleanup", () => {
  beforeAll(bootstrapPrivateDb);
  it("never deletes another ready original when an expired restored intent has a foreign or same-gallery storage key", async () => {
    const ownerGallery = await seedGallery(await seedClient(), "draft");
    const otherGallery = await seedGallery(await seedClient(), "draft");
    for (const protectedGallery of [otherGallery, ownerGallery]) {
      const protectedId = crypto.randomUUID();
      const protectedKey = `client-galleries/${protectedGallery}/${protectedId}.png`;
      const bytes = new TextEncoder().encode("synthetic protected original " + protectedId);
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((byte) => byte.toString(16).padStart(2, "0")).join("");
      await env.DB.prepare(
        `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,original_sha256,created_at,updated_at)
         VALUES (?,?,?,'protected.png','image/png',?,0,'ready',?,'2000-01-01','2000-01-01')`,
      ).bind(protectedId, protectedGallery, protectedKey, bytes.length, digest).run();
      await env.ORIGINALS.put(protectedKey, bytes, {
        httpMetadata: { contentType: "image/png" }, customMetadata: { sha256: digest },
      });

      const orphanId = crypto.randomUUID();
      const intentId = crypto.randomUUID();
      const canonicalOrphan = `client-galleries/${ownerGallery}/${orphanId}.jpg`;
      await env.DB.prepare(
        `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at)
         VALUES (?,?,?,'orphan.jpg','image/jpeg',1,1,'pending','2000-01-01','2000-01-01')`,
      ).bind(orphanId, ownerGallery, canonicalOrphan).run();
      await env.DB.prepare(
        `INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at)
         VALUES (?,?,?,'image/jpeg',1,?,'uploaded','2000-01-01','2000-01-01')`,
      ).bind(intentId, ownerGallery, orphanId, protectedKey).run();
      await cleanupPrivateGalleryUploads(env);
      const stored = await env.ORIGINALS.get(protectedKey);
      expect(stored, "cleanup must preserve the unrelated ready R2 object").not.toBeNull();
      expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(bytes);
      expect(await env.DB.prepare("SELECT status,original_sha256 AS digest FROM client_gallery_images WHERE id=?")
        .bind(protectedId).first()).toEqual({ status: "ready", digest });
    }
  });
  it("does not delete an original if a concurrent restore makes its image ready after the cleanup claim", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const image = crypto.randomUUID();
    const intent = crypto.randomUUID();
    const key = `client-galleries/${gallery}/${image}.jpg`;
    await env.DB.prepare(
      `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at)
       VALUES (?,?,?,'race.jpg','image/jpeg',1,0,'pending','2000-01-01','2000-01-01')`,
    ).bind(image, gallery, key).run();
    await env.DB.prepare(
      `INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at)
       VALUES (?,?,?,'image/jpeg',1,?,'uploaded','2000-01-01','2000-01-01')`,
    ).bind(intent, gallery, image, key).run();
    await env.ORIGINALS.put(key, "x");
    let raced = false;
    const raceDb = {
      prepare(sql: string) {
        const stmt = env.DB.prepare(sql);
        if (!sql.startsWith("UPDATE client_gallery_images SET status='failed'")) return stmt;
        return {
          bind(...args: Parameters<typeof stmt.bind>) {
            const bound = stmt.bind(...args);
            return {
              async run() {
                raced = true;
                await env.DB.prepare("UPDATE client_gallery_images SET status='ready' WHERE id=?")
                  .bind(image).run();
                return bound.run();
              },
            };
          },
        } as unknown as typeof stmt;
      },
    } as unknown as D1Database;
    await cleanupPrivateGalleryUploads({ ...env, DB: raceDb } as Env);
    expect(raced).toBe(true);
    expect(await env.ORIGINALS.head(key)).not.toBeNull();
    expect(await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?")
      .bind(image).first()).toEqual({ status: "ready" });
    expect(await env.DB.prepare("SELECT completed_at AS completedAt FROM client_gallery_upload_intents WHERE id=?")
      .bind(intent).first()).toEqual({ completedAt: null });
  });
  it("does not delete an original when a restore promotes its image immediately after cleanup marks it failed", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const image = crypto.randomUUID();
    const intent = crypto.randomUUID();
    const key = `client-galleries/${gallery}/${image}.jpg`;
    await env.DB.prepare(
      `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at)
       VALUES (?,?,?,'restored.jpg','image/jpeg',1,0,'pending','2000-01-01','2000-01-01')`,
    ).bind(image, gallery, key).run();
    await env.DB.prepare(
      `INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at)
       VALUES (?,?,?,'image/jpeg',1,?,'uploaded','2000-01-01','2000-01-01')`,
    ).bind(intent, gallery, image, key).run();
    await env.ORIGINALS.put(key, "x");
    let restored = false;
    const raceDb = {
      prepare(sql: string) {
        const stmt = env.DB.prepare(sql);
        if (!sql.startsWith("UPDATE client_gallery_images SET status='failed'")) return stmt;
        return {
          bind(...args: Parameters<typeof stmt.bind>) {
            const bound = stmt.bind(...args);
            return {
              async run() {
                const updated = await bound.run();
                await env.DB.prepare("UPDATE client_gallery_images SET status='ready' WHERE id=?")
                  .bind(image).run();
                restored = true;
                return updated;
              },
            };
          },
        } as unknown as typeof stmt;
      },
    } as unknown as D1Database;
    await cleanupPrivateGalleryUploads({ ...env, DB: raceDb } as Env);
    expect(restored).toBe(true);
    expect(await env.ORIGINALS.head(key)).not.toBeNull();
    expect(await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?")
      .bind(image).first()).toEqual({ status: "ready" });
    expect(await env.DB.prepare("SELECT completed_at AS completedAt FROM client_gallery_upload_intents WHERE id=?")
      .bind(intent).first()).toEqual({ completedAt: null });
  });
  it("retries an expired upload after object deletion fails", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const image = crypto.randomUUID();
    const intent = crypto.randomUUID();
    const key = `client-galleries/${gallery}/${image}.jpg`;
    await env.DB.prepare(
      `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at)
      VALUES (?,?,?,'retry.jpg','image/jpeg',1,0,'pending','2000-01-01','2000-01-01')`,
    )
      .bind(image, gallery, key)
      .run();
    await env.DB.prepare(
      `INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at)
      VALUES (?,?,?,'image/jpeg',1,?,'uploaded','2000-01-01','2000-01-01')`,
    )
      .bind(intent, gallery, image, key)
      .run();
    await env.ORIGINALS.put(key, "x");
    const failing = new Proxy(env.ORIGINALS, {
      get(target, property) {
        if (property === "delete")
          return async () => {
            throw new Error("Simulated interrupted cleanup");
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      cleanupPrivateGalleryUploads({ ...env, ORIGINALS: failing } as Env),
    ).rejects.toThrow("Simulated interrupted cleanup");
    expect(await env.ORIGINALS.head(key)).not.toBeNull();
    await cleanupPrivateGalleryUploads(env);
    expect(await env.ORIGINALS.head(key)).toBeNull();
  });
  it("expires abandoned objects and leaves completed private originals intact", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const now = new Date().toISOString();
    const keys: string[] = [];
    for (const ready of [false, true]) {
      const image = crypto.randomUUID();
      const id = crypto.randomUUID();
      const key = `client-galleries/${gallery}/${image}.jpg`;
      keys.push(key);
      await env.DB.prepare(
        `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at)
        VALUES (?,?,?,'a.jpg','image/jpeg',1,0,?,'2000-01-01',?)`,
      )
        .bind(image, gallery, key, ready ? "ready" : "pending", now)
        .run();
      await env.DB.prepare(
        `INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at)
        VALUES (?,?,?,'image/jpeg',1,?,?,'2000-01-01','2000-01-01')`,
      )
        .bind(id, gallery, image, key, ready ? "completed" : "uploaded")
        .run();
      await env.ORIGINALS.put(key, "x");
    }
    await cleanupPrivateGalleryUploads(env);
    expect(await env.ORIGINALS.head(keys[0])).toBeNull();
    expect(await env.ORIGINALS.head(keys[1])).not.toBeNull();
    expect(
      (await env.DB.prepare(
        "SELECT status FROM client_gallery_upload_intents WHERE storage_key=?",
      )
        .bind(keys[0])
        .first<{ status: string }>())!.status,
    ).toBe("expired");
  });
});
