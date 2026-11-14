import { handleQaRecovery } from "../../scripts/private-recovery-worker";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb, seedClient, seedGallery, seedReadyImage, privateRequest } from "./client-fixture";
import { assertPrivateQaVacant } from "../../scripts/lib/private-preview.mjs";
import { captureClientRecovery, restoreClientRecovery } from "../../scripts/lib/private-recovery";
import { servePrivateGalleryImage } from "../../worker/media/private-gallery";
import { createClientSession, requireClient } from "../../worker/client/auth";

const bindings = env as unknown as Env & { RESTORE_DB: D1Database; RESTORE_ORIGINALS: R2Bucket };
const migrations = import.meta.glob("../../migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("scoped private recovery with real local D1/R2", () => {
  beforeAll(async () => {
    await bootstrapPrivateDb();
    for (const path of Object.keys(migrations).sort()) {
      for (const sql of migrations[path].split(";").map((s) => s.trim()).filter(Boolean))
        await bindings.RESTORE_DB.prepare(sql).run();
    }
  });

  it("allows a vacant QA pair and rejects a reused one without modifying it", async () => {
    const query = async (role: string, sql: string, params: string[]) =>
      (await (role === "source" ? env.DB : bindings.RESTORE_DB).prepare(sql).bind(...params).all()).results;
    const objects = (role: string) => (role === "source" ? env.ORIGINALS : bindings.RESTORE_ORIGINALS).list({ limit: 1 });
    await expect(assertPrivateQaVacant(query, objects)).resolves.toBeUndefined();
    await env.BACKUPS.put("preserved-qa-orphan", new Uint8Array([4]));
    await expect(assertPrivateQaVacant(query, () => env.BACKUPS.list({ limit: 1 }))).rejects.toThrow("not empty");
    const id = await seedClient();
    await expect(assertPrivateQaVacant(query, objects)).rejects.toThrow("not empty");
    expect(await env.DB.prepare("SELECT id FROM client_accounts WHERE id=?").bind(id).first()).toEqual({ id });
  });

  it("restores only selected clients, preserves other data and invalidates source sessions", async () => {
    const a = await seedClient();
    const b = await seedClient();
    const gallery = await seedGallery(a);
    const foreign = await seedGallery(b);
    const photo = await seedReadyImage(gallery);
    await seedReadyImage(foreign);
    const key = `client-galleries/${gallery}/${photo}.png`;
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    await env.ORIGINALS.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
    await env.DB.prepare("UPDATE client_gallery_images SET size_bytes=? WHERE id=?").bind(bytes.length, photo).run();
    for (let i = 1; i < 10; i++) {
      const next = await seedReadyImage(gallery);
      await env.ORIGINALS.put(`client-galleries/${gallery}/${next}.png`, bytes, { httpMetadata: { contentType: "image/png" } });
      await env.DB.prepare("UPDATE client_gallery_images SET size_bytes=? WHERE id=?").bind(bytes.length, next).run();
    }
    await env.DB.prepare("INSERT INTO client_gallery_favorites VALUES (?,?,?,datetime('now'))").bind(a, gallery, photo).run();
    const sourceCookie = await createClientSession({ id: a, sessionVersion: 1 }, env);
    const snapshot = await captureClientRecovery(env.DB, env.ORIGINALS, [a]);
    expect(snapshot.tables.client_accounts.map((c) => c.id)).toEqual([a]);
    expect(snapshot.tables.client_galleries.map((g) => g.id)).toEqual([gallery]);
    const publicBefore = await bindings.RESTORE_DB.prepare("SELECT * FROM site_settings").all();
    const result = await restoreClientRecovery(snapshot, bindings.RESTORE_DB, bindings.RESTORE_ORIGINALS);
    expect(result.rows).toBe(13);
    expect(result.objects).toBe(10);
    expect(result.hashes).toEqual(Array(10).fill("f1581abaa0673dad1cdb190a5234ee14eff769d3836de4f70ecb17cdd4ccfa76"));
    expect(new Uint8Array(await (await bindings.RESTORE_ORIGINALS.get(key))!.arrayBuffer())).toEqual(bytes);
    expect(await bindings.RESTORE_DB.prepare("SELECT id FROM client_accounts WHERE id=?").bind(b).first()).toBeNull();
    expect(await bindings.RESTORE_DB.prepare("SELECT * FROM site_settings").all()).toMatchObject({ results: publicBefore.results });
    await expect(requireClient(privateRequest("/api/client/me", "GET", undefined, "punctum_client_session=" + sourceCookie), env, bindings.RESTORE_DB)).rejects.toMatchObject({ status: 401 });
    const laterSourceCookie = await createClientSession({ id: a, sessionVersion: 2 }, env);
    await expect(requireClient(privateRequest("/api/client/me", "GET", undefined, "punctum_client_session=" + laterSourceCookie), env, bindings.RESTORE_DB)).rejects.toMatchObject({ status: 401 });
    expect(result).toMatchObject({ accountsQuarantined: true, requiresSessionSecretRotation: true });
    // Controlled re-opening is a separate operator action after installing a new secret.
    const restoredEnv = { ...env, CLIENT_SESSION_SECRET: "new-independent-restored-environment-secret-2026" } as Env;
    await bindings.RESTORE_DB.prepare("UPDATE client_accounts SET disabled_at=NULL WHERE id=?").bind(a).run();
    const fresh = await createClientSession({ id: a, sessionVersion: 2 }, restoredEnv);
    expect((await requireClient(privateRequest("/api/client/me", "GET", undefined, "punctum_client_session=" + fresh), restoredEnv, bindings.RESTORE_DB)).id).toBe(a);
    await expect(requireClient(privateRequest("/api/client/me", "GET", undefined, "punctum_client_session=" + laterSourceCookie), restoredEnv, bindings.RESTORE_DB)).rejects.toMatchObject({ status: 401 });
    expect(await bindings.RESTORE_DB.prepare("PRAGMA foreign_key_check").all()).toMatchObject({ results: [] });
    await expect(restoreClientRecovery(snapshot, bindings.RESTORE_DB, bindings.RESTORE_ORIGINALS)).rejects.toThrow("exists");
  });

  it("refuses a conflicting object without overwriting its bytes or inserting rows", async () => {
    const id = await seedClient();
    const gallery = await seedGallery(id);
    const photo = await seedReadyImage(gallery);
    const key = `client-galleries/${gallery}/${photo}.png`;
    await env.ORIGINALS.put(key, new Uint8Array([1]), { httpMetadata: { contentType: "image/png" } });
    const snapshot = await captureClientRecovery(env.DB, env.ORIGINALS, [id]);
    await bindings.RESTORE_ORIGINALS.put(key, new Uint8Array([2]));
    await expect(restoreClientRecovery(snapshot, bindings.RESTORE_DB, bindings.RESTORE_ORIGINALS)).rejects.toThrow("conflict");
    expect(new Uint8Array(await (await bindings.RESTORE_ORIGINALS.get(key))!.arrayBuffer())).toEqual(new Uint8Array([2]));
    expect(await bindings.RESTORE_DB.prepare("SELECT id FROM client_accounts WHERE id=?").bind(id).first()).toBeNull();
  });
  it("rejects incoherent covers, size and MIME before writing any restored object", async () => {
    const id = await seedClient();
    const gallery = await seedGallery(id);
    const photo = await seedReadyImage(gallery);
    const key = `client-galleries/${gallery}/${photo}.png`;
    await env.ORIGINALS.put(key, new Uint8Array([1]), { httpMetadata: { contentType: "image/png" } });
    const original = await captureClientRecovery(env.DB, env.ORIGINALS, [id]);
    for (const corrupt of [
      (s: typeof original) => { s.tables.client_galleries[0].cover_image_id = crypto.randomUUID(); },
      (s: typeof original) => { s.tables.client_gallery_images[0].size_bytes = 2; },
      (s: typeof original) => { s.objects[0].httpMetadata.contentType = "image/jpeg"; },
    ]) {
      const snapshot = structuredClone(original);
      corrupt(snapshot);
      await expect(restoreClientRecovery(snapshot, bindings.RESTORE_DB, bindings.RESTORE_ORIGINALS)).rejects.toThrow();
      expect(await bindings.RESTORE_ORIGINALS.head(key)).toBeNull();
      expect(await bindings.RESTORE_DB.prepare("SELECT id FROM client_accounts WHERE id=?").bind(id).first()).toBeNull();
    }
  });

  it("runs authenticated QA recovery through a private backup and denies production or replay", async () => {
    const id = await seedClient();
    await env.DB.prepare("UPDATE client_accounts SET email=? WHERE id=?").bind(`pilot-${id}@example.invalid`, id).run();
    const gallery = await seedGallery(id);
    const photo = await seedReadyImage(gallery);
    await env.ORIGINALS.put(`client-galleries/${gallery}/${photo}.png`, new Uint8Array([1]), { httpMetadata: { contentType: "image/png" } });
    const origin = "https://punctum-picture-albums-qa.example.workers.dev";
    const qa = { ENVIRONMENT: "preview", QA_RECOVERY_ENABLED: "true", SITE_ORIGIN: origin,
      QA_RECOVERY_SECRET: "test-only-qa-recovery-secret-with-independent-entropy", QA_RECOVERY_CLIENT_ID: id,
      SOURCE_DB: env.DB, RESTORE_DB: bindings.RESTORE_DB,
      SOURCE_ORIGINALS: env.ORIGINALS, RESTORE_ORIGINALS: bindings.RESTORE_ORIGINALS, BACKUPS: env.BACKUPS };
    const request = (authorized = true, ids = [id]) => new Request(origin + "/qa/recover", { method: "POST", headers: {
      Origin: origin, Authorization: authorized ? "Bearer " + qa.QA_RECOVERY_SECRET : "Bearer invalid", "Content-Type": "application/json",
    }, body: JSON.stringify({ clientIds: ids }) });
    expect((await handleQaRecovery(request(), { ...qa, ENVIRONMENT: "production" })).status).toBe(404);
    expect((await handleQaRecovery(request(false), qa)).status).toBe(403);
    const other = await seedClient();
    await env.DB.prepare("UPDATE client_accounts SET email=? WHERE id=?").bind(`pilot-${other}@example.invalid`, other).run();
    expect((await handleQaRecovery(request(true, [other]), qa)).status).toBe(403);
    const result = await handleQaRecovery(request(), qa);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ objects: 1, accountsQuarantined: true, requiresSessionSecretRotation: true, backupVerified: true });
    expect((await handleQaRecovery(request(), qa)).status).toBe(409);
    const restored = await bindings.RESTORE_DB.prepare("SELECT disabled_at FROM client_accounts WHERE id=?").bind(id).first<{ disabled_at: string }>();
    expect(restored!.disabled_at).toBeTruthy();
  });

  it("retries after partial R2 failure while leaving destination rows untouched", async () => {
    const id = await seedClient();
    const gallery = await seedGallery(id);
    for (let i = 0; i < 2; i++) {
      const image = await seedReadyImage(gallery);
      await env.ORIGINALS.put(`client-galleries/${gallery}/${image}.png`, new Uint8Array([i]), { httpMetadata: { contentType: "image/png" } });
    }
    const snapshot = await captureClientRecovery(env.DB, env.ORIGINALS, [id]);
    let puts = 0;
    const failingBucket = new Proxy(bindings.RESTORE_ORIGINALS, { get(target, property) {
      if (property === "put") return async (...args: Parameters<R2Bucket["put"]>) => {
        if (++puts === 2) throw new Error("injected storage outage");
        return target.put(...args);
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(restoreClientRecovery(snapshot, bindings.RESTORE_DB, failingBucket)).rejects.toThrow("storage outage");
    expect(await bindings.RESTORE_DB.prepare("SELECT id FROM client_accounts WHERE id=?").bind(id).first()).toBeNull();
    const result = await restoreClientRecovery(snapshot, bindings.RESTORE_DB, bindings.RESTORE_ORIGINALS);
    expect(result.objects).toBe(2);
    expect(result.accountsQuarantined).toBe(true);
  });

  it("restores two clients and ten originals then enforces A/B download isolation", async () => {
    const a = await seedClient();
    const b = await seedClient();
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const collections: { gallery: string; first: string }[] = [];
    for (const id of [a, b]) {
      const gallery = await seedGallery(id);
      let first = "";
      for (let i = 0; i < 5; i++) {
        const photo = await seedReadyImage(gallery);
        first ||= photo;
        await env.ORIGINALS.put(`client-galleries/${gallery}/${photo}.png`, bytes, { httpMetadata: { contentType: "image/png" } });
        await env.DB.prepare("UPDATE client_gallery_images SET size_bytes=? WHERE id=?").bind(bytes.length, photo).run();
      }
      await env.DB.prepare("UPDATE client_galleries SET cover_image_id=?,allow_downloads=1 WHERE id=?").bind(first, gallery).run();
      await env.DB.prepare("INSERT INTO client_gallery_favorites VALUES (?,?,?,datetime('now'))").bind(id, gallery, first).run();
      collections.push({ gallery, first });
    }
    const snapshot = await captureClientRecovery(env.DB, env.ORIGINALS, [a, b]);
    const result = await restoreClientRecovery(snapshot, bindings.RESTORE_DB, bindings.RESTORE_ORIGINALS);
    expect(result).toMatchObject({ rows: 16, objects: 10, accountsQuarantined: true });
    const restoredEnv = { ...env, DB: bindings.RESTORE_DB, ORIGINALS: bindings.RESTORE_ORIGINALS, CLIENT_SESSION_SECRET: "rotated-two-client-restore-secret-independent-from-source" } as Env;
    await bindings.RESTORE_DB.prepare("UPDATE client_accounts SET disabled_at=NULL WHERE id IN (?,?)").bind(a,b).run();
    const ca = "punctum_client_session=" + await createClientSession({ id: a, sessionVersion: 2 }, restoredEnv);
    const cb = "punctum_client_session=" + await createClientSession({ id: b, sessionVersion: 2 }, restoredEnv);
    const [ga,gb] = collections;
    const own = await servePrivateGalleryImage(privateRequest("/api/client/galleries", "GET", undefined, ca), restoredEnv, ga.gallery, ga.first, "download", "client");
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(bytes);
    await expect(servePrivateGalleryImage(privateRequest("/api/client/galleries", "GET", undefined, ca), restoredEnv, gb.gallery, gb.first, "download", "client")).rejects.toMatchObject({ status: 404 });
    await expect(servePrivateGalleryImage(privateRequest("/api/client/galleries", "GET", undefined, cb), restoredEnv, ga.gallery, ga.first, "download", "client")).rejects.toMatchObject({ status: 404 });
    expect(await bindings.RESTORE_DB.prepare("SELECT COUNT(*) AS count FROM client_gallery_favorites WHERE client_id IN (?,?)").bind(a,b).first()).toEqual({ count: 2 });
  });

});
