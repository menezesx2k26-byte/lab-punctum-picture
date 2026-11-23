import { envNumber, requireDb } from "../utils/env";
import { privateGalleryStorageKey } from "./gallery-storage-key";
export const PRIVATE_BACKUP_TABLES = [
  "client_accounts",
  "client_galleries",
  "client_gallery_images",
  "client_gallery_upload_intents",
  "client_gallery_favorites",
] as const;
export async function hasPrivateGallerySchema(db: D1Database) {
  return Boolean(
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='client_gallery_upload_intents'",
      )
      .first(),
  );
}
export async function cleanupPrivateGalleryUploads(env: Env): Promise<void> {
  const db = requireDb(env);
  if (!(await hasPrivateGallerySchema(db)) || !env.ORIGINALS) return;
  const now = new Date().toISOString();
  const cutoff = new Date(
    Date.now() -
      envNumber(env, "CLEANUP_ORPHAN_UPLOAD_AGE_HOURS", 24) * 3_600_000,
  ).toISOString();
  const intents = (
    await db
      .prepare(
        `SELECT i.id,i.gallery_id AS galleryId,i.image_id AS imageId,
          i.expected_mime AS expectedMime,i.expected_size AS expectedSize,
          i.storage_key AS storageKey
        FROM client_gallery_upload_intents i
        JOIN client_gallery_images m ON m.gallery_id=i.gallery_id AND m.id=i.image_id
        WHERE i.status IN ('pending','uploaded','failed','expired')
          AND i.completed_at IS NULL AND i.expires_at<? AND i.created_at<?
          AND m.status!='ready' AND m.deleted_at IS NULL
          AND i.storage_key=m.storage_key
          AND i.expected_mime=m.mime_type AND i.expected_size=m.size_bytes
          AND i.storage_key=('client-galleries/' || i.gallery_id || '/' || i.image_id ||
            CASE i.expected_mime WHEN 'image/png' THEN '.png'
              WHEN 'image/webp' THEN '.webp'
              WHEN 'image/jpeg' THEN '.jpg' END)
        LIMIT 500`,
      )
      .bind(now, cutoff)
      .all<{ id: string; galleryId: string; imageId: string;
        expectedMime: string; expectedSize: number; storageKey: string }>()
  ).results;
  for (const intent of intents) {
    const expectedKey = privateGalleryStorageKey(
      intent.galleryId, intent.imageId, intent.expectedMime,
    );
    if (!expectedKey || intent.storageKey !== expectedKey) continue;
    const claimed = await db
      .prepare(
        `UPDATE client_gallery_upload_intents SET status='expired'
         WHERE id=? AND gallery_id=? AND image_id=? AND storage_key=?
           AND expected_mime=? AND expected_size=?
           AND completed_at IS NULL AND expires_at<? AND created_at<?
           AND status IN ('pending','uploaded','failed','expired')
           AND EXISTS(SELECT 1 FROM client_gallery_images
             WHERE gallery_id=? AND id=? AND storage_key=?
               AND mime_type=? AND size_bytes=?
               AND status!='ready' AND deleted_at IS NULL)
         RETURNING id`,
      )
      .bind(intent.id, intent.galleryId, intent.imageId, expectedKey,
        intent.expectedMime, intent.expectedSize, now, cutoff, intent.galleryId,
        intent.imageId, expectedKey, intent.expectedMime, intent.expectedSize)
      .first();
    if (!claimed) continue;
    const imageTransition = await db
      .prepare(
        `UPDATE client_gallery_images SET status='failed',updated_at=?
         WHERE gallery_id=? AND id=? AND storage_key=? AND mime_type=?
           AND size_bytes=? AND status!='ready' AND deleted_at IS NULL`,
      )
      .bind(now, intent.galleryId, intent.imageId, expectedKey,
        intent.expectedMime, intent.expectedSize)
      .run();
    // A restore may have promoted or changed the image after the claim.
    // Leave this intent eligible for a later D1 retry on a mismatch.
    if (imageTransition.meta.changes !== 1) continue;
    // QUARANTINE, NOT DELETE: R2.delete has no conditional ETag/lease. A
    // concurrent restore can promote the image or replace its R2 object in
    // the gap *after* even the strongest final D1 SELECT. Physical deletion
    // here could therefore destroy a newly valid private original.
    //
    // Close the expired intent with a conditional D1 update instead. Keep
    // the canonical R2 object immutable and recoverable; completion of this
    // maintenance pass does NOT mean its bytes were removed. An eventual
    // destructive sweep requires an independently verified exclusive
    // operator/rollback protocol, never an active Worker cron.
    //
    // The EXISTS guard prevents a predictable restore/rebind between the
    // image transition and the final D1 commit. External writers after it
    // cannot cause loss of bytes because we do not issue an R2 delete.
    await db
      .prepare(
        `UPDATE client_gallery_upload_intents SET completed_at=?
         WHERE id=? AND gallery_id=? AND image_id=? AND storage_key=?
           AND expected_mime=? AND expected_size=?
           AND status='expired' AND completed_at IS NULL
           AND EXISTS(SELECT 1 FROM client_gallery_images m
             WHERE m.gallery_id=? AND m.id=? AND m.storage_key=?
               AND m.mime_type=? AND m.size_bytes=? AND m.status='failed'
               AND m.deleted_at IS NULL AND m.updated_at=?)`,
      )
      .bind(now, intent.id, intent.galleryId, intent.imageId, expectedKey,
        intent.expectedMime, intent.expectedSize, intent.galleryId,
        intent.imageId, expectedKey, intent.expectedMime, intent.expectedSize,
        now)
      .run();
  }
}
