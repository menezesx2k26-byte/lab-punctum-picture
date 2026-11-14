import { recoverySelection, recoveryInsert } from "./private-recovery-format.mjs";
/** Operator library only. No HTTP route or automatic production invocation. */
type Row = Record<string, string | number | null>;
const tables = ["client_accounts", "client_galleries", "client_gallery_images", "client_gallery_upload_intents", "client_gallery_favorites"] as const;
type Table = typeof tables[number];
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
  const clients = new Set(snapshot.tables.client_accounts.map((r) => r.id));
  const galleries = new Set(snapshot.tables.client_galleries.map((r) => r.id));
  const images = new Map(snapshot.tables.client_gallery_images.map((r) => [r.id, r]));
  if (snapshot.tables.client_galleries.some((r) => !clients.has(r.client_id)) ||
      snapshot.tables.client_gallery_images.some((r) => !galleries.has(r.gallery_id) || !String(r.storage_key).startsWith(`client-galleries/${r.gallery_id}/`)) ||
      snapshot.tables.client_gallery_favorites.some((r) => !clients.has(r.client_id) || images.get(r.image_id)?.gallery_id !== r.gallery_id ||
        !snapshot.tables.client_galleries.some((g) => g.id === r.gallery_id && g.client_id === r.client_id)) ||
      snapshot.tables.client_gallery_upload_intents.some((r) => images.get(r.image_id)?.gallery_id !== r.gallery_id || images.get(r.image_id)?.storage_key !== r.storage_key) ||
      snapshot.objects.some((o) => !snapshot.tables.client_gallery_images.some((r) => r.storage_key === o.key)))
    throw new Error("Recovery scope mismatch");
  for (const gallery of snapshot.tables.client_galleries) {
    if (gallery.cover_image_id !== null) {
      const cover = images.get(gallery.cover_image_id);
      if (!cover || cover.gallery_id !== gallery.id || cover.status !== "ready" || cover.deleted_at !== null)
        throw new Error("Recovery cover mismatch");
    }
  }
  for (const object of snapshot.objects) {
    const image = snapshot.tables.client_gallery_images.find((r) => r.storage_key === object.key)!;
    if (object.bytes.length !== image.size_bytes || object.httpMetadata.contentType !== image.mime_type)
      throw new Error("Recovery object metadata mismatch");
  }
  const keys = new Set(snapshot.objects.map((o) => o.key));
  if (keys.size !== snapshot.objects.length || snapshot.tables.client_gallery_images.some((r) => r.status === "ready" && !keys.has(String(r.storage_key))))
    throw new Error("Recovery object missing or duplicated");
}

export async function captureClientRecovery(db: D1Database, bucket: R2Bucket, clientIds: string[]): Promise<ClientRecovery> {
  const statements = recoverySelection(clientIds);
  // D1 batch gives the relational snapshot a consistent transaction boundary.
  const rows = await db.batch<Row>(tables.map((t) => db.prepare(statements[t]).bind(...clientIds)));
  const data = Object.fromEntries(tables.map((t, i) => [t, rows[i].results])) as Record<Table, Row[]>;
  if (data.client_accounts.length !== clientIds.length) throw new Error("Recovery client missing");
  const snapshot: ClientRecovery = { version: 1, tables: data, objects: [] };
  for (const image of data.client_gallery_images) {
    const key = String(image.storage_key);
    // Check scope before touching storage, including malformed DB references.
    if (!key.startsWith(`client-galleries/${image.gallery_id}/`)) throw new Error("Recovery scope mismatch");
    const object = await bucket.get(key);
    if (!object) {
      if (image.status === "ready") throw new Error("Recovery object missing");
      continue;
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== image.size_bytes) throw new Error("Recovery object size mismatch");
    snapshot.objects.push({ key, bytes, sha256: await hash(bytes), httpMetadata: object.httpMetadata ?? {}, customMetadata: object.customMetadata ?? {} });
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
