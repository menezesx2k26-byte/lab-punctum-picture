import { closeSync, openSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";
import { privateQaDatabasePath } from "./runtime.mjs";
import { qaApplicationId } from "./sqlite.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const quoted = name => '"' + name.replaceAll('"', '""') + '"';

function canonicalRow(row) {
  return JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key => {
    const value = row[key];
    return [key, value instanceof Uint8Array ? { blobSha256: hash(value), bytes: value.length } : value];
  })));
}

// Deliberately accepts only marked synthetic databases. Production export/import
// and real R2 transfer remain separate, gated operations.
export function inspectQaManifest(file) {
  const sql = new DatabaseSync(privateQaDatabasePath(file), { readOnly: true });
  try {
    sql.exec("BEGIN");
    if (sql.prepare("PRAGMA application_id").get().application_id !== qaApplicationId) {
      throw new Error("Only a synthetic Punctum QA database is accepted");
    }
    if (sql.prepare("PRAGMA integrity_check").all().some(row => row.integrity_check !== "ok") ||
        sql.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error("QA snapshot integrity or foreign keys failed");
    }
    const schema = sql.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    const tables = {};
    for (const { name } of schema.filter(row => row.type === "table")) {
      const rows = sql.prepare(`SELECT * FROM ${quoted(name)}`).all().map(canonicalRow).sort();
      tables[name] = { rows: rows.length, sha256: hash(rows.join("\n")) };
    }
    let bytes = 0;
    const media = sql.prepare("SELECT key, bytes, etag FROM node_qa_media ORDER BY key").all();
    for (const row of media) {
      if (hash(row.bytes) !== row.etag) throw new Error("QA original checksum mismatch");
      bytes += row.bytes.length;
    }
    const bundledReferences = sql.prepare("SELECT count(*) AS count FROM images WHERE original_key LIKE 'static:%'").get().count;
    const missing = sql.prepare(`SELECT count(*) AS count FROM images i WHERE i.status = 'ready'
      AND i.deleted_at IS NULL AND i.original_key NOT LIKE 'static:%'
      AND NOT EXISTS (SELECT 1 FROM node_qa_media m WHERE m.key = i.original_key)`).get().count;
    if (missing) throw new Error("QA snapshot has missing original references");
    return { schemaVersion: 1, scope: "SYNTHETIC_QA_ONLY", schemaSha256: hash(schema.map(canonicalRow).join("\n")),
      integrity: "ok", foreignKeyViolations: 0, missingOriginals: 0, tables,
      media: { objects: media.length, bytes, bundledReferences, bundledBytesVerified: false } };
  } finally {
    sql.close();
  }
}

export async function createQaSnapshot(source, target) {
  const canonicalSource = privateQaDatabasePath(source);
  inspectQaManifest(canonicalSource);
  // Exclusive creation prevents replacing any existing database or symlink.
  closeSync(openSync(target, "wx", 0o600));
  let sql;
  try {
    privateQaDatabasePath(target);
    sql = new DatabaseSync(canonicalSource, { readOnly: true });
    await backup(sql, target);
    return inspectQaManifest(target);
  } catch (error) {
    unlinkSync(target); // Only the file created exclusively by this invocation.
    throw error;
  } finally {
    sql?.close();
  }
}
