import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb } from "./client-fixture";
import { handleScheduled } from "../../worker/scheduled";

async function album() {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO albums(id,slug,title,status,created_at,updated_at) VALUES (?,?,?,'draft','2000-01-01','2000-01-01')",
  ).bind(id, id, "Synthetic public album").run();
  return id;
}

async function image(gallery: string, status: "pending" | "ready", deletedAt: string | null = null) {
  const id = crypto.randomUUID();
  const key = `originals/${gallery}/${id}.png`;
  await env.DB.prepare(
    `INSERT INTO images
     (id,album_id,original_key,original_filename,mime_type,size_bytes,position,status,deleted_at,created_at,updated_at)
     VALUES (?,?,?,'synthetic.png','image/png',1,0,?,?,'2000-01-01','2000-01-01')`,
  ).bind(id, gallery, key, status, deletedAt).run();
  return { id, key, gallery };
}

async function staleIntent(target: ReturnType<typeof image> extends Promise<infer T> ? T : never, key = target.key) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO upload_intents
     (id,album_id,image_id,object_key,original_filename,expected_mime,expected_size,status,created_by,expires_at,created_at)
     VALUES (?,?,?,?,'synthetic.png','image/png',1,'uploaded','synthetic-qa','2000-01-01','2000-01-01')`,
  ).bind(id, target.gallery, target.id, key).run();
  return id;
}

async function runCron(bindings: Env = env as Env) {
  const promises: Promise<unknown>[] = [];
  await handleScheduled({ cron: "0 5 * * *" } as ScheduledController, bindings, {
    waitUntil(promise: Promise<unknown>) { promises.push(promise); },
  } as ExecutionContext);
  await Promise.all(promises);
}

describe("public editorial upload cleanup preserves original images across restoration races", () => {
  beforeAll(bootstrapPrivateDb);

  it("never deletes a ready Studio original pointed to by a forged expired intent from another album", async () => {
    const orphan = await image(await album(), "pending");
    const protectedImage = await image(await album(), "ready");
    const intent = await staleIntent(orphan, protectedImage.key);
    const bytes = Uint8Array.of(42);
    await env.ORIGINALS.put(protectedImage.key, bytes);
    await runCron();
    const protectedOriginal = await env.ORIGINALS.get(protectedImage.key);
    expect(protectedOriginal, "Studio's ready image must retain its bytes").not.toBeNull();
    expect(new Uint8Array(await protectedOriginal!.arrayBuffer())).toEqual(bytes);
    expect(await env.DB.prepare("SELECT status FROM images WHERE id=?")
      .bind(protectedImage.id).first()).toEqual({ status: "ready" });
    expect(await env.DB.prepare("SELECT status FROM upload_intents WHERE id=?")
      .bind(intent).first()).toEqual({ status: "uploaded" });
  });

  it("never physically deletes an original if a restore promotes it between the last D1 read and R2 delete", async () => {
    const orphan = await image(await album(), "pending");
    const intent = await staleIntent(orphan);
    await env.ORIGINALS.put(orphan.key, Uint8Array.of(69));
    let deletes = 0;
    const bucket = new Proxy(env.ORIGINALS, {
      get(target, prop) {
        if (prop === "delete") return async (key: string) => {
          deletes++;
          await env.DB.prepare("UPDATE images SET status='ready' WHERE id=?")
            .bind(orphan.id).run();
          return target.delete(key);
        };
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await runCron({ ...env, ORIGINALS: bucket } as Env);
    expect(deletes, "active public cleanup must not use unfenced R2.delete").toBe(0);
    expect(await env.ORIGINALS.head(orphan.key)).not.toBeNull();
    expect(await env.DB.prepare("SELECT status FROM images WHERE id=?")
      .bind(orphan.id).first()).toEqual({ status: "failed" });
    expect(await env.DB.prepare(
      "SELECT status,completed_at AS completedAt FROM upload_intents WHERE id=?",
    ).bind(intent).first()).toMatchObject({ status: "expired" });
  });

  it("never mutates soft-deleted public images during repeated scheduled cleanup runs", async () => {
    const orphan = await image(await album(), "pending", "2026-11-09T15:00:00Z");
    const intent = await staleIntent(orphan);
    await env.ORIGINALS.put(orphan.key, Uint8Array.of(70));
    const before = await env.DB.prepare(
      "SELECT status,updated_at AS updatedAt,deleted_at AS deletedAt FROM images WHERE id=?",
    ).bind(orphan.id).first();
    for (let i = 0; i < 3; i++) await runCron();
    expect(await env.DB.prepare(
      "SELECT status,updated_at AS updatedAt,deleted_at AS deletedAt FROM images WHERE id=?",
    ).bind(orphan.id).first()).toEqual(before);
    expect(await env.DB.prepare("SELECT status FROM upload_intents WHERE id=?")
      .bind(intent).first()).toEqual({ status: "uploaded" });
    expect(await env.ORIGINALS.head(orphan.key)).not.toBeNull();
  });
  it("leaves a late-restored Studio image ready and retains its original when D1 quarantine finalization loses the race", async () => {
    const orphan = await image(await album(), "pending");
    const intent = await staleIntent(orphan);
    const data = Uint8Array.of(97);
    await env.ORIGINALS.put(orphan.key, data);
    let restoreInterleaved = 0;
    const racingDb = {
      prepare(sql: string) {
        const statement = env.DB.prepare(sql);
        if (!sql.includes("UPDATE upload_intents") || !sql.includes("SET status='expired',completed_at="))
          return statement;
        return {
          bind(...values: Parameters<typeof statement.bind>) {
            const bound = statement.bind(...values);
            return {
              async run() {
                restoreInterleaved++;
                await env.DB.prepare("UPDATE images SET status='ready' WHERE id=?")
                  .bind(orphan.id).run();
                return bound.run();
              },
            };
          },
        } as unknown as typeof statement;
      },
    } as unknown as D1Database;
    await runCron({ ...env, DB: racingDb } as Env);
    expect(restoreInterleaved).toBe(1);
    expect(await env.DB.prepare(
      "SELECT status,completed_at AS completedAt FROM upload_intents WHERE id=?",
    ).bind(intent).first()).toEqual({ status: "uploaded", completedAt: null });
    expect(await env.DB.prepare("SELECT status FROM images WHERE id=?")
      .bind(orphan.id).first()).toEqual({ status: "ready" });
    expect(new Uint8Array(await (await env.ORIGINALS.get(orphan.key))!.arrayBuffer()))
      .toEqual(data);
  });
});
