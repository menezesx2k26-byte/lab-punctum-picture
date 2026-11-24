import assert from "node:assert/strict";
import { appendFileSync, chmodSync, createReadStream, createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { sourceInventory, downloadObject, verifyOriginal } from "./punctum-r2-encrypted-stage.mjs";
import { stageOriginal } from "../services/punctum-hostinger-production/originals.mjs";
import { classifyReference } from "../services/punctum-hostinger-production/validate-real-parity.mjs";
import { databaseInventory, loadD1Snapshot } from "../services/punctum-hostinger-production/managed-import.mjs";

export const MANAGED_EXPORT_MIGRATIONS = Object.freeze([
  "0009_private_client_galleries.sql",
  "0010_public_home_snapshot.sql",
  "0011_private_gallery_byte_integrity.sql",
  "0012_public_home_snapshot_mutations.sql",
  "0013_private_gallery_upload_token_version.sql",
  "0014_clerk_pilot_identity_links.sql",
  "0015_clerk_admin_identity_links.sql",
  "0016_private_gallery_layout_presets.sql",
  "0017_private_gallery_logical_delete.sql",
]);

function tableColumnInventory(db, tableName, columns) {
  const quotedTable = `"${tableName.replaceAll('"', '""')}"`;
  const select = columns.map((col) => `"${col.replaceAll('"', '""')}"`).join(",");
  const rows = db.prepare(`SELECT ${select} FROM ${quotedTable}`).all().map((row) => JSON.stringify(row)).sort();
  return { rows: rows.length, sha256: createHash("sha256").update(rows.join("\n")).digest("hex") };
}

export function applyManagedExportMigrations(db, migrationsDir = "migrations") {
  const sourceTables = databaseInventory(db);
  const sourceColumns = Object.fromEntries(
    Object.keys(sourceTables).map((name) => [
      name,
      db.prepare(`PRAGMA table_info("${name.replaceAll('"', '""')}")`).all().map((col) => col.name),
    ]),
  );
  const known = new Set(db.prepare("SELECT name FROM d1_migrations").all().map(({ name }) => name));
  const applied = [];
  for (const file of MANAGED_EXPORT_MIGRATIONS) {
    if (known.has(file)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(readFileSync(join(migrationsDir, file), "utf8"));
      db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
      db.exec("COMMIT");
      applied.push(file);
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const tables = databaseInventory(db);
  for (const [name, value] of Object.entries(sourceTables)) {
    if (name === "d1_migrations") continue;
    if (name === "client_galleries" && (applied.includes("0016_private_gallery_layout_presets.sql") || applied.includes("0017_private_gallery_logical_delete.sql"))) {
      assert.deepEqual(tableColumnInventory(db, name, sourceColumns[name]), value, "Migration 0016 changed pre-existing client_galleries columns");
      if (applied.includes("0016_private_gallery_layout_presets.sql")) {
        const nonDefault = db.prepare("SELECT COUNT(*) AS n FROM client_galleries WHERE layout_preset != 'classico'").get().n;
        assert.equal(nonDefault, 0, "Migration 0016 must assign default classico to legacy albums");
      }
      if (applied.includes("0017_private_gallery_logical_delete.sql")) {
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM client_galleries WHERE deleted_at IS NOT NULL").get().n, 0, "Migration 0017 must preserve all existing albums");
      }
    } else {
      assert.deepEqual(tables[name], value, "Migration changed source data");
    }
  }
  return { sourceTables, tables, applied };
}

async function runManagedExport() {
  process.umask(0o077);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  assert.equal(account, "257bca437616da74ece1ce4bbaf0bd89", "Wrong source account");
  const token = process.env.CLOUDFLARE_API_TOKEN;
  assert(token && process.env.CLOUDFLARE_D1_API_TOKEN, "Missing authorized source credentials");
  const output = resolve(process.env.PUNCTUM_MANAGED_OUTPUT);
  const root = mkdtempSync(join(tmpdir(), "punctum-managed-export-"));
  chmodSync(root, 0o700);
  try {
    mkdirSync(output, { mode: 0o700 });
    const sqlPath = join(root, "source.sql");
    execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "export", "punctum-picture", "--remote", "--output", sqlPath], {
      env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_D1_API_TOKEN },
      stdio: ["ignore", "pipe", "pipe"], timeout: 120_000,
    });
    const sql = readFileSync(sqlPath);
    const dbPath = join(root, "application.sqlite");
    const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
    let objects, adminEmail, sourceTables, tables, sampleImageId;
    try {
      loadD1Snapshot(db, sql.toString("utf8"));
      ({ sourceTables, tables } = applyManagedExportMigrations(db, "migrations"));
      db.exec("PRAGMA application_id=1347767888");
      adminEmail = process.env.SOURCE_ADMIN_EMAIL?.trim().toLowerCase();
      assert(/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(adminEmail ?? ""), "Source admin allowlist requires review");
      const inventory = await sourceInventory(account, token);
      const originals = join(root, "originals");
      mkdirSync(originals, { mode: 0o700 });
      objects = [];
      for (const row of inventory.objects) {
        const blob = await downloadObject(account, token, row.key);
        const info = verifyOriginal(row, blob);
        stageOriginal(originals, info.key, blob, info.contentType, info.sha256);
        objects.push(info);
      }
      const current = await sourceInventory(account, token);
      assert.deepEqual(current, inventory, "Source inventory changed during export");
      const byKey = new Map(objects.map((item) => [item.key, { ...item, etag: item.sha256 }]));
      for (const [table, column] of [["images", "original_key"], ["site_media", "storage_key"], ["client_gallery_images", "storage_key"]]) {
        for (const row of db.prepare(`SELECT ${column} AS key,status,size_bytes AS size${table === "images" ? ",checksum" : ""} FROM ${table}`).all()) {
          assert(["present", "static", "missing_nonready"].includes(classifyReference(row, byKey.get(row.key))), "Source reference parity failed");
        }
      }
      sampleImageId = db.prepare("SELECT i.id FROM images i JOIN albums a ON i.album_id=a.id WHERE i.status='ready' AND a.status='published' AND i.original_key NOT LIKE 'static:%' ORDER BY i.id LIMIT 1").get()?.id;
      assert(typeof sampleImageId === "string", "Published image sample missing");
    } finally { db.close(); }
    const sqlSha256 = createHash("sha256").update(sql).digest("hex");
    const manifest = { schema: "punctum-managed-seed-v1", sqlSha256, objects, tables };
    writeFileSync(join(root, "seed-manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
    const archive = join(output, "seed.tar.gz");
    execFileSync("tar", ["-czf", archive, "-C", root, "application.sqlite", "originals", "seed-manifest.json"]);
    const key = randomBytes(32), iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const bundle = join(output, "managed-seed.bin");
    writeFileSync(bundle, iv, { mode: 0o600, flag: "wx" });
    await pipeline(createReadStream(archive), cipher, createWriteStream(bundle, { flags: "a" }));
    appendFileSync(bundle, cipher.getAuthTag());
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(bundle)) hash.update(chunk);
    const digest = hash.digest("hex");
    writeFileSync(join(output, "private-environment.json"), JSON.stringify({
      PUNCTUM_MANAGED_IMPORT_KEY: key.toString("hex"), PUNCTUM_MANAGED_IMPORT_SHA256: digest,
      PUNCTUM_CANDIDATE_ADMIN_EMAIL: adminEmail,
    }), { mode: 0o600, flag: "wx" });
    const receipt = { sourceReadOnly: true, sourceAccount: account, objects: objects.length,
      bytes: objects.reduce((sum, { size }) => sum + size, 0), sqlSha256, cipherSha256: digest,
      originalsManifestSha256: createHash("sha256").update(objects.map((item) => JSON.stringify(item)).join("\n")).digest("hex"), sourceTables, tables, sampleImageId };
    writeFileSync(join(output, "export-receipt.json"), JSON.stringify(receipt), { mode: 0o600 });
    console.log(JSON.stringify(receipt));
    rmSync(archive);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runManagedExport();
}
