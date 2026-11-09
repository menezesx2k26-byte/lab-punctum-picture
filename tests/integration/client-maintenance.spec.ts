import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb, seedClient, seedGallery, privateRequest } from "./client-fixture";
import { cleanupPrivateGalleryUploads } from "../../worker/client/maintenance";
import { captureClientRecovery } from "../../scripts/lib/private-recovery";
import { createClientSession } from "../../worker/client/auth";
import { servePrivateGalleryImage } from "../../worker/media/private-gallery";

describe("private upload cleanup", () => {
  beforeAll(bootstrapPrivateDb);
  it("quarantines an expired original without invoking unconditional R2 deletion, even if a restore races the delete boundary", async () => {
    const client = await seedClient();
    const gallery = await seedGallery(client, "draft");
    const image = crypto.randomUUID();
    const intent = crypto.randomUUID();
    const key = `client-galleries/${gallery}/${image}.jpg`;
    const bytes = new TextEncoder().encode("recoverable private original " + image);
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(byte => byte.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare(
      `INSERT INTO client_gallery_images
       (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at)
       VALUES (?,?,?,'quarantine.jpg','image/jpeg',?,0,'pending','2000-01-01','2000-01-01')`,
    ).bind(image, gallery, key, bytes.length).run();
    await env.DB.prepare(
      `INSERT INTO client_gallery_upload_intents
       (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at,sha256)
       VALUES (?,?,?,'image/jpeg',?,?,'uploaded','2000-01-01','2000-01-01',?)`,
    ).bind(intent, gallery, image, bytes.length, key, digest).run();
    await env.ORIGINALS.put(key, bytes, {
      httpMetadata: { contentType: "image/jpeg" }, customMetadata: { sha256: digest },
    });
    let deletionCalls = 0;
    const bucket = new Proxy(env.ORIGINALS, {
      get(target, property) {
        if (property === "delete") return async (deleteKey: string) => {
          deletionCalls++;
          // This restore happens after the last D1 read but before
          // unconditional R2.delete() in the pre-fix cleanup.
          await env.DB.prepare("UPDATE client_gallery_images SET status='ready' WHERE id=?")
            .bind(image).run();
          return target.delete(deleteKey);
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await cleanupPrivateGalleryUploads({ ...env, ORIGINALS: bucket } as Env);
    expect(deletionCalls, "active cleanup must never invoke unfenced R2 delete").toBe(0);
    const original = await env.ORIGINALS.get(key);
    expect(original, "a quarantined original must be recoverable").not.toBeNull();
    expect(new Uint8Array(await original!.arrayBuffer())).toEqual(bytes);
    expect(original!.customMetadata?.sha256).toBe(digest);
    expect(await env.DB.prepare(
      "SELECT status,completed_at AS completedAt,sha256 FROM client_gallery_upload_intents WHERE id=?",
    ).bind(intent).first()).toMatchObject({
      status: "expired", sha256: digest,
    });
    const quarantine = await env.DB.prepare(
      "SELECT completed_at AS completedAt FROM client_gallery_upload_intents WHERE id=?",
    ).bind(intent).first<{ completedAt: string | null }>();
    expect(quarantine?.completedAt).toMatch(/^20\d\d-/);
    expect(await env.DB.prepare(
      "SELECT status FROM client_gallery_images WHERE id=?",
    ).bind(image).first()).toEqual({ status: "failed" });
    const snapshot = await captureClientRecovery(env.DB, env.ORIGINALS, [client]);
    expect(snapshot.tables.client_gallery_upload_intents).toEqual([
      expect.objectContaining({ id: intent, status: "expired", sha256: digest }),
    ]);
    expect(snapshot.tables.client_gallery_images).toEqual([
      expect.objectContaining({ id: image, status: "failed", storage_key: key }),
    ]);
    expect(snapshot.objects.map(({ key: objectKey, sha256 }) => [objectKey, sha256]))
      .toEqual([[key, digest]]);

    // Even if a gallery is re-published and downloads become allowed, the
    // quarantined failed image must never yield private bytes to the client.
    await env.DB.prepare(
      "UPDATE client_galleries SET status='published',allow_downloads=1 WHERE id=?",
    ).bind(gallery).run();
    const cookie = "punctum_client_session=" + await createClientSession({
      id: client, sessionVersion: 1,
    }, env);
    for (const [method, preset, headOnly] of [
      ["GET", "gallery", false], ["HEAD", "gallery", true], ["GET", "download", false],
    ] as const) {
      await expect(servePrivateGalleryImage(privateRequest(
        "/api/client/galleries", method, undefined, cookie,
      ), env, gallery, image, preset, "client", headOnly))
        .rejects.toMatchObject({ status: 404 });
    }
    await cleanupPrivateGalleryUploads({ ...env, ORIGINALS: bucket } as Env);
    expect(deletionCalls).toBe(0);
    expect(await env.ORIGINALS.head(key)).not.toBeNull();
    expect(await env.DB.prepare(
      "SELECT completed_at AS completedAt FROM client_gallery_upload_intents WHERE id=?",
    ).bind(intent).first()).toEqual(quarantine);
  });
  it("does not finalize an expired intent if restore promotes its image immediately before the conditional quarantine commit", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const image = crypto.randomUUID();
    const intent = crypto.randomUUID();
    const key = `client-galleries/${gallery}/${image}.jpg`;
    await env.DB.prepare(
      `INSERT INTO client_gallery_images
       (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at)
       VALUES (?,?,?,'late.jpg','image/jpeg',1,0,'pending','2000-01-01','2000-01-01')`,
    ).bind(image, gallery, key).run();
    await env.DB.prepare(
      `INSERT INTO client_gallery_upload_intents
       (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at)
       VALUES (?,?,?,'image/jpeg',1,?,'uploaded','2000-01-01','2000-01-01')`,
    ).bind(intent, gallery, image, key).run();
    await env.ORIGINALS.put(key, "y");
    let promoted = 0;
    const raceDb = {
      prepare(sql: string) {
        const stmt = env.DB.prepare(sql);
        if (!sql.includes("UPDATE client_gallery_upload_intents SET completed_at=")) return stmt;
        return {
          bind(...values: Parameters<typeof stmt.bind>) {
            const bound = stmt.bind(...values);
            return {
              async run() {
                promoted++;
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
    expect(promoted).toBe(1);
    expect(await env.DB.prepare(
      "SELECT status,completed_at AS completedAt FROM client_gallery_upload_intents WHERE id=?",
    ).bind(intent).first()).toEqual({ status: "expired", completedAt: null });
    expect(await env.DB.prepare("SELECT status FROM client_gallery_images WHERE id=?")
      .bind(image).first()).toEqual({ status: "ready" });
    expect(await env.ORIGINALS.head(key)).not.toBeNull();
  });
  it("does not churn revoked soft-deleted images or touch their immutable originals on repeated cron runs", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const image = crypto.randomUUID();
    const intent = crypto.randomUUID();
    const key = `client-galleries/${gallery}/${image}.jpg`;
    const revokedAt = "2026-11-09T16:00:00Z";
    await env.DB.prepare(
      `INSERT INTO client_gallery_images
       (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,deleted_at,created_at,updated_at)
       VALUES (?,?,?,'revoked.jpg','image/jpeg',1,0,'pending',?,'2000-01-01','2000-01-01')`,
    ).bind(image, gallery, key, revokedAt).run();
    await env.DB.prepare(
      `INSERT INTO client_gallery_upload_intents
       (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at)
       VALUES (?,?,?,'image/jpeg',1,?,'uploaded','2000-01-01','2000-01-01')`,
    ).bind(intent, gallery, image, key).run();
    await env.ORIGINALS.put(key, "z");
    const first = await env.DB.prepare(
      "SELECT status,updated_at AS updatedAt,deleted_at AS deletedAt FROM client_gallery_images WHERE id=?",
    ).bind(image).first();
    for (let i=0; i<3; i++) await cleanupPrivateGalleryUploads(env);
    expect(await env.DB.prepare(
      "SELECT status,updated_at AS updatedAt,deleted_at AS deletedAt FROM client_gallery_images WHERE id=?",
    ).bind(image).first()).toEqual(first);
    expect(await env.DB.prepare(
      "SELECT status,completed_at AS completedAt FROM client_gallery_upload_intents WHERE id=?",
    ).bind(intent).first()).toEqual({ status: "uploaded", completedAt: null });
    expect(await env.ORIGINALS.head(key)).not.toBeNull();
  });
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
  it("quarantines abandoned originals even when R2 deletion is unavailable", async () => {
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
    ).resolves.toBeUndefined();
    expect(await env.ORIGINALS.head(key)).not.toBeNull();
    const finalized = await env.DB.prepare(
      "SELECT status,completed_at AS completedAt FROM client_gallery_upload_intents WHERE id=?",
    ).bind(intent).first<{ status: string; completedAt: string | null }>();
    expect(finalized?.status).toBe("expired");
    expect(finalized?.completedAt).not.toBeNull();
    await cleanupPrivateGalleryUploads(env);
    expect(await env.ORIGINALS.head(key)).not.toBeNull();
    expect(await env.DB.prepare(
      "SELECT status,completed_at AS completedAt FROM client_gallery_upload_intents WHERE id=?",
    ).bind(intent).first()).toEqual(finalized);
  });
  it("expires abandoned intents while retaining both quarantined and completed private originals", async () => {
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
    expect(await env.ORIGINALS.head(keys[0])).not.toBeNull();
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
