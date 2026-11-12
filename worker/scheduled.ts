import { envNumber, envString, requireDb } from "./utils/env";
import { PRIVATE_BACKUP_TABLES, hasPrivateGallerySchema, cleanupPrivateGalleryUploads } from "./client/maintenance";

const BACKUP_TABLES = [
  "site_settings",
  "categories",
  "albums",
  "album_categories",
  "images",
  "upload_intents",
  "inquiries",
  "audit_log",
  "admin_credentials",
  "rate_limit_buckets",
  "backup_runs",
  "site_config",
  "site_config_versions",
  "site_config_pointers",
] as const;

async function logicalBackup(env: Env): Promise<void> {
  const db = requireDb(env);
  if (!env.BACKUPS) {
    throw new Error("Binding BACKUPS indisponível");
  }

  const createdAt = new Date();
  const data: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  const tables=await hasPrivateGallerySchema(db) ? [...BACKUP_TABLES,...PRIVATE_BACKUP_TABLES] : BACKUP_TABLES;
  for (const table of tables) {
    const result = await db.prepare(`SELECT * FROM ${table}`).all();
    data[table] = result.results;
    rowCounts[table] = result.results.length;
  }

  const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
  const prefix = envString(env, "BACKUP_PREFIX") ?? "backups/d1";
  const dailyKey = `${prefix}/daily/${createdAt.toISOString().slice(0, 10)}/${stamp}.json`;
  const body = JSON.stringify({
    format: "punctum-picture-logical-backup-v1",
    createdAt: createdAt.toISOString(),
    data,
  });
  const puts: Promise<R2Object>[] = [
    env.BACKUPS.put(dailyKey, body, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { retention: "daily" },
    }),
  ];

  if (createdAt.getUTCDay() === 0) {
    puts.push(
      env.BACKUPS.put(`${prefix}/weekly/${createdAt.toISOString().slice(0, 10)}/${stamp}.json`, body, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { retention: "weekly" },
      }),
    );
  }
  if (createdAt.getUTCDate() === 1) {
    puts.push(
      env.BACKUPS.put(`${prefix}/monthly/${createdAt.toISOString().slice(0, 7)}/${stamp}.json`, body, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { retention: "monthly" },
      }),
    );
  }
  await Promise.all(puts);

  await db
    .prepare(
      `INSERT INTO backup_runs (
        id, object_key, status, row_counts_json, created_at
      ) VALUES (?, ?, 'completed', ?, ?)`,
    )
    .bind(crypto.randomUUID(), dailyKey, JSON.stringify(rowCounts), createdAt.toISOString())
    .run();
}

async function cleanupBackupPrefix(
  bucket: R2Bucket,
  prefix: string,
  maxAgeDays: number,
): Promise<void> {
  let cursor: string | undefined;
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    const expired = listed.objects.filter((object) => object.uploaded.getTime() < cutoff);
    if (expired.length > 0) {
      await bucket.delete(expired.map((object) => object.key));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function cleanupOldBackups(env: Env): Promise<void> {
  if (!env.BACKUPS) return;
  const prefix = envString(env, "BACKUP_PREFIX") ?? "backups/d1";
  await Promise.all([
    cleanupBackupPrefix(env.BACKUPS, `${prefix}/daily/`, 7),
    cleanupBackupPrefix(env.BACKUPS, `${prefix}/weekly/`, 28),
    cleanupBackupPrefix(env.BACKUPS, `${prefix}/monthly/`, 183),
  ]);
}

// Public editorial images and private client albums use different namespaces.
// This exact mapping is a fail-closed guard against legacy/restored D1 intents
// that accidentally point at another public image or a private-gallery key.
function publicOriginalKey(albumId: string, imageId: string, mime: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(albumId) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(imageId)) return null;
  const extension = mime === "image/png" ? "png" :
    mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : null;
  return extension ? `originals/${albumId}/${imageId}.${extension}` : null;
}

async function cleanupOrphanUploads(env: Env): Promise<void> {
  const db = requireDb(env);
  const ageHours = envNumber(env, "CLEANUP_ORPHAN_UPLOAD_AGE_HOURS", 24);
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - ageHours * 3_600_000).toISOString();
  const expired = await db
    .prepare(
      `SELECT i.id, i.album_id AS albumId, i.image_id AS imageId,
         i.object_key AS objectKey, i.expected_mime AS expectedMime,
         i.expected_size AS expectedSize
       FROM upload_intents i
       JOIN images m ON m.id=i.image_id AND m.album_id=i.album_id
       WHERE i.status IN ('pending','uploaded','expired')
         AND i.completed_at IS NULL AND i.expires_at < ? AND i.created_at < ?
         AND m.status!='ready' AND m.deleted_at IS NULL
         AND m.original_key=i.object_key AND m.mime_type=i.expected_mime
         AND m.size_bytes=i.expected_size
       LIMIT 500`,
    )
    .bind(now, cutoff)
    .all<{ id: string; albumId: string; imageId: string; objectKey: string;
      expectedMime: string; expectedSize: number }>();

  for (const intent of expired.results) {
    const key = publicOriginalKey(intent.albumId, intent.imageId, intent.expectedMime);
    if (!key || intent.objectKey !== key) continue;
    // Never delete an R2 original from an active Worker. A restore may rebind
    // the D1 identity or promote the image after the final D1 read; R2.delete
    // has no onlyIf precondition. Preserve bytes in private bucket quarantine
    // until a separately authorized, exclusive operator has verified backup,
    // ownership and rollback. No unverified R2 reads or copies are needed.
    const image = await db.prepare(
      `UPDATE images SET status='failed',updated_at=?
       WHERE id=? AND album_id=? AND original_key=?
         AND mime_type=? AND size_bytes=?
         AND status IN ('pending','failed') AND deleted_at IS NULL
         AND EXISTS(SELECT 1 FROM upload_intents i
           WHERE i.id=? AND i.album_id=? AND i.image_id=?
             AND i.object_key=? AND i.expected_mime=? AND i.expected_size=?
             AND i.status IN ('pending','uploaded','expired')
             AND i.completed_at IS NULL AND i.expires_at<? AND i.created_at<?)`,
    ).bind(now, intent.imageId, intent.albumId, key, intent.expectedMime,
      intent.expectedSize, intent.id, intent.albumId, intent.imageId, key,
      intent.expectedMime, intent.expectedSize, now, cutoff).run();
    if (image.meta.changes !== 1) continue;
    // A late restore that makes the image ready prevents finalization.
    // completed_at for an expired intent means quarantine was recorded in D1,
    // not that the R2 object was physically deleted.
    await db.prepare(
      `UPDATE upload_intents
       SET status='expired',completed_at=?,error_message=?
       WHERE id=? AND album_id=? AND image_id=? AND object_key=?
         AND expected_mime=? AND expected_size=?
         AND status IN ('pending','uploaded','expired') AND completed_at IS NULL
         AND expires_at<? AND created_at<?
         AND EXISTS(SELECT 1 FROM images m
           WHERE m.id=? AND m.album_id=? AND m.original_key=?
             AND m.mime_type=? AND m.size_bytes=? AND m.status='failed'
             AND m.deleted_at IS NULL AND m.updated_at=?)`,
    ).bind(now, "Expirado; original preservado em quarentena", intent.id,
      intent.albumId, intent.imageId, key, intent.expectedMime, intent.expectedSize,
      now, cutoff, intent.imageId, intent.albumId, key,
      intent.expectedMime, intent.expectedSize, now).run();
  }
  await db
    .prepare("DELETE FROM rate_limit_buckets WHERE expires_at < ?")
    .bind(new Date().toISOString())
    .run();
}

export async function handleScheduled(
  event: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const jobs: Promise<void>[] = [cleanupOrphanUploads(env),cleanupPrivateGalleryUploads(env)];
  if (event.cron === "0 3 * * *") {
    jobs.push(logicalBackup(env), cleanupOldBackups(env));
  }
  ctx.waitUntil(Promise.all(jobs).then(() => undefined));
}
