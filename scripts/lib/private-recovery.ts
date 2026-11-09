import { recoverySelection, recoveryInsert } from "./private-recovery-format.mjs";
import { privateGalleryStorageKey } from "../../worker/client/gallery-storage-key";
/** Operator library only. No HTTP route or automatic production invocation. */
type Row = Record<string, string | number | null>;
const tables = ["client_accounts", "client_galleries", "client_gallery_images", "client_gallery_upload_intents", "client_gallery_favorites"] as const;
type Table = typeof tables[number];
// Narrowly preserve the R4 synthetic G18 fixture's historic nested PNG key.
// Unlike a prefix match this still binds the exact gallery and image IDs.
// This exception is for operator backup/restore only; product media and
// uploads continue to require the current canonical key.
function isRecoverableOriginalKey(row: Row): boolean {
  const galleryId = String(row.gallery_id);
  const imageId = String(row.id);
  const mime = String(row.mime_type);
  const canonical = privateGalleryStorageKey(galleryId, imageId, mime);
  if (!canonical) return false;
  const historical = mime === "image/png"
    ? `client-galleries/${galleryId}/${imageId}/original.png`
    : null;
  return row.storage_key === canonical || row.storage_key === historical;
}
export type ClientRecovery = {
  version: 1;
  tables: Record<Table, Row[]>;
  objects: { key: string; bytes: Uint8Array; sha256: string; httpMetadata: R2HTTPMetadata; customMetadata: Record<string, string> }[];
};
async function hash(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))).map((v) => v.toString(16).padStart(2, "0")).join("");
}
function assertScope(snapshot: ClientRecovery) {
  if (snapshot.version !== 1 || !snapshot.tables.client_accounts.length) throw new Error("Invalid recovery snapshot");
  assertRowScope(snapshot);
  const images = new Map(snapshot.tables.client_gallery_images.map((r) => [r.id, r]));
  for (const object of snapshot.objects) {
    const image = snapshot.tables.client_gallery_images.find((r) => r.storage_key === object.key);
    if (!image) throw new Error("Recovery scope mismatch");
    if (object.bytes.length !== image.size_bytes || object.httpMetadata.contentType !== image.mime_type)
      throw new Error("Recovery object metadata mismatch");
    // Backups may contain pre-migration rows with NULL digests. For attested
    // rows, never restore inconsistent D1/R2 evidence as if it were verified.
    if ((image.original_sha256 != null && image.original_sha256 !== object.sha256) ||
        (object.customMetadata?.sha256 != null && object.customMetadata.sha256 !== object.sha256))
      throw new Error("Recovery digest mismatch");
  }
  // A backup's upload-intent digest is a separate D1 attestation.
  const objects = new Map(snapshot.objects.map(object => [object.key, object]));
  for (const intent of snapshot.tables.client_gallery_upload_intents) {
    if (intent.sha256 === null) continue;
    const image = images.get(intent.image_id);
    const object = objects.get(String(intent.storage_key));
    if (!image || !object || intent.sha256 !== object.sha256 ||
        (image.original_sha256 !== null && image.original_sha256 !== intent.sha256))
      throw new Error("Recovery intent digest mismatch");
  }
  const keys = new Set(snapshot.objects.map((o) => o.key));
  if (keys.size !== snapshot.objects.length || snapshot.tables.client_gallery_images.some((r) => r.status === "ready" && !keys.has(String(r.storage_key))))
    throw new Error("Recovery object missing or duplicated");
}

// Check relational ownership and canonical R2 keys *before* any bucket read
// during capture or any bucket write during restore. Prefix-only checks could
// back up a different image's original under a forged legacy D1 storage_key.
function assertRowScope(snapshot: ClientRecovery) {
  // A forged archive can repeat a primary identity while giving each image a
  // different, otherwise canonical R2 key. D1 would reject the later INSERT
  // only after the operator had written those R2 objects. Detect duplicate
  // source identities before any capture read or restore write.
  for (const table of tables) {
    const primary = table === "client_gallery_favorites"
      ? ["client_id", "gallery_id", "image_id"] : ["id"];
    const keys = snapshot.tables[table].map((row) => primary.map((field) => row[field]));
    if (keys.some((parts) => parts.some((value) => typeof value !== "string" || !value.trim())) ||
        new Set(keys.map((parts) => JSON.stringify(parts))).size !== keys.length)
      throw new Error("Recovery snapshot primary key mismatch");
  }
  const clients = new Set(snapshot.tables.client_accounts.map((r) => r.id));
  const galleries = new Set(snapshot.tables.client_galleries.map((r) => r.id));
  const images = new Map(snapshot.tables.client_gallery_images.map((r) => [r.id, r]));
  if (snapshot.tables.client_galleries.some((r) => !clients.has(r.client_id)) ||
      snapshot.tables.client_gallery_images.some((r) => !galleries.has(r.gallery_id) ||
        !isRecoverableOriginalKey(r)) ||
      snapshot.tables.client_gallery_favorites.some((r) => !clients.has(r.client_id) || images.get(r.image_id)?.gallery_id !== r.gallery_id ||
        !snapshot.tables.client_galleries.some((g) => g.id === r.gallery_id && g.client_id === r.client_id)) ||
      snapshot.tables.client_gallery_upload_intents.some((r) => {
        const image = images.get(r.image_id);
        return image?.gallery_id !== r.gallery_id || image.storage_key !== r.storage_key ||
          image.mime_type !== r.expected_mime || image.size_bytes !== r.expected_size;
      }) ||
      snapshot.objects.some((o) => !snapshot.tables.client_gallery_images.some((r) => r.storage_key === o.key)))
    throw new Error("Recovery scope mismatch");
  for (const gallery of snapshot.tables.client_galleries) {
    if (gallery.cover_image_id !== null) {
      const cover = images.get(gallery.cover_image_id);
      if (!cover || cover.gallery_id !== gallery.id || cover.status !== "ready" || cover.deleted_at !== null)
        throw new Error("Recovery cover mismatch");
    }
  }
}

export async function captureClientRecovery(db: D1Database, bucket: R2Bucket, clientIds: string[]): Promise<ClientRecovery> {
  const statements = recoverySelection(clientIds);
  // D1 batch gives the relational snapshot a consistent transaction boundary.
  const rows = await db.batch<Row>(tables.map((t) => db.prepare(statements[t]).bind(...clientIds)));
  const data = Object.fromEntries(tables.map((t, i) => [t, rows[i].results])) as Record<Table, Row[]>;
  if (data.client_accounts.length !== clientIds.length) throw new Error("Recovery client missing");
  const snapshot: ClientRecovery = { version: 1, tables: data, objects: [] };
  assertRowScope(snapshot);
  for (const image of data.client_gallery_images) {
    const key = String(image.storage_key);
    const object = await bucket.get(key);
    if (!object) {
      if (image.status === "ready") throw new Error("Recovery object missing");
      continue;
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== image.size_bytes) throw new Error("Recovery object size mismatch");
    const sha256 = await hash(bytes);
    if ((image.original_sha256 != null && image.original_sha256 !== sha256) ||
        (object.customMetadata?.sha256 != null && object.customMetadata.sha256 !== sha256))
      throw new Error("Recovery digest mismatch");
    snapshot.objects.push({ key, bytes, sha256, httpMetadata: object.httpMetadata ?? {}, customMetadata: object.customMetadata ?? {} });
  }
  assertScope(snapshot);
  return snapshot;
}

export async function restoreClientRecovery(snapshot: ClientRecovery, db: D1Database, bucket: R2Bucket) {
  assertScope(snapshot);
  // Inspect conflicts before writes. INSERTs below still enforce uniqueness atomically.
  for (const table of tables) {
    for (const row of snapshot.tables[table]) {
      const primary = table === "client_gallery_favorites" ? ["client_id", "gallery_id", "image_id"] : ["id"];
      if (await db.prepare(`SELECT 1 FROM ${table} WHERE ${primary.map((p) => `${p}=?`).join(" AND ")}`).bind(...primary.map((p) => row[p])).first())
        throw new Error("Recovery destination row exists");
    }
  }
  // These UNIQUE constraints do not use the rows' primary IDs. A destination
  // account with the same email, or an already claimed image/intent key, can
  // otherwise cause the final D1 batch to fail *after* R2 objects were written.
  // Preflight the immutable schema-defined columns before crossing into R2.
  // Concurrent destination mutations still require isolated QA/restore gates.
  for (const [table, column] of [
    ["client_accounts", "email"],
    ["client_gallery_images", "storage_key"],
    ["client_gallery_upload_intents", "storage_key"],
  ] as const) {
    const values = snapshot.tables[table].map((row) => row[column]);
    if (values.some((value) => typeof value !== "string" || !value.trim()) ||
        new Set(values).size !== values.length)
      throw new Error("Recovery snapshot unique constraint mismatch");
    for (const value of values) {
      if (await db.prepare(`SELECT 1 FROM ${table} WHERE ${column}=?`).bind(value).first())
        throw new Error("Recovery destination unique conflict");
    }
  }
  // Validate all SQL and account versions before touching storage.
  const inserts = tables.flatMap((table) => snapshot.tables[table].map((source) => {
    const { sql, params } = recoveryInsert(table, source);
    return db.prepare(sql).bind(...params);
  }));
  // Verify the entire archive before writing its first object.
  for (const object of snapshot.objects)
    if (await hash(object.bytes) !== object.sha256) throw new Error("Recovery checksum mismatch");
  for (const object of snapshot.objects) {
    const written = await bucket.put(object.key, object.bytes, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: object.httpMetadata, customMetadata: object.customMetadata });
    const saved = await bucket.get(object.key);
    if (!saved || await hash(new Uint8Array(await saved.arrayBuffer())) !== object.sha256)
      throw new Error(written ? "Recovery verification failed" : "Recovery object conflict");
    if (JSON.stringify(saved.httpMetadata ?? {}) !== JSON.stringify(object.httpMetadata) || JSON.stringify(saved.customMetadata ?? {}) !== JSON.stringify(object.customMetadata))
      throw new Error("Recovery object metadata conflict");
  }
  // Never UPSERT/replace. A failure leaves immutable objects for a safe retry, never deletes them.
  if (inserts.length) await db.batch(inserts);
  return { rows: inserts.length, objects: snapshot.objects.length, hashes: snapshot.objects.map((o) => o.sha256), accountsQuarantined: true, requiresSessionSecretRotation: true };
}
