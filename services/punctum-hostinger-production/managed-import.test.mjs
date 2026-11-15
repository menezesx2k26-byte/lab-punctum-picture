import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { importManagedSeed, loadD1Snapshot } from "./managed-import.mjs";
import { stageOriginal } from "./originals.mjs";
import { verifyManagedData } from "./managed-verify.mjs";

test("D1 restore permits export ordering but rejects an orphaned reference", () => {
  const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  try {
    loadD1Snapshot(db, "CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES(1); INSERT INTO parent VALUES(1);");
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.throws(() => loadD1Snapshot(db, "INSERT INTO child VALUES(2);"), /MANAGED_SOURCE_DATABASE_INVALID/);
  } finally { db.close(); }
});

test("managed import authenticates bytes, preserves original hashes, and reuses edited persistent DB", async (t) => {
  process.umask(0o077);
  const root = mkdtempSync(join(tmpdir(), "punctum-managed-import-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, "input");
  mkdirSync(input, { mode: 0o700 });
  const originals = join(input, "originals");
  mkdirSync(originals, { mode: 0o700 });
  const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const keyName = "originals/test/test.png";
  const sha256 = createHash("sha256").update(image).digest("hex");
  stageOriginal(originals, keyName, image, "image/png", sha256);
  const db = new DatabaseSync(join(input, "application.sqlite"));
  db.exec("PRAGMA application_id=1347767888; CREATE TABLE images(original_key TEXT,status TEXT);");
  db.prepare("INSERT INTO images VALUES (?, 'ready')").run(keyName);
  db.close();
  writeFileSync(join(input, "seed-manifest.json"), JSON.stringify({
    schema: "punctum-managed-seed-v1", sqlSha256: "a".repeat(64), objects: [{ key: keyName, size: image.length, sha256 }],
  }));
  const tar = join(root, "seed.tar.gz");
  execFileSync("tar", ["-czf", tar, "-C", input, "application.sqlite", "originals", "seed-manifest.json"]);
  const key = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const bytes = Buffer.concat([iv, cipher.update(readFileSync(tar)), cipher.final(), cipher.getAuthTag()]);
  const bundle = join(root, "seed.bin");
  writeFileSync(bundle, bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const destination = join(root, "imported");
  const config = { bundle, key: key.toString("hex"), digest, destination };
  await assert.rejects(importManagedSeed({ ...config, key: randomBytes(32).toString("hex") }));
  assert.equal(existsSync(destination), false);
  const receipt = await importManagedSeed(config);
  assert.equal(receipt.objects, 1);
  assert.equal(receipt.bytes, image.length);
  const storage = { dbFile: join(destination, "application.sqlite"), originals: join(destination, "originals") };
  assert.equal((await verifyManagedData(storage, "a".repeat(64))).objects, 1);
  await assert.rejects(verifyManagedData(storage, "b".repeat(64)), /MANAGED_IMPORTED_SOURCE_MISMATCH/);
  const live = new DatabaseSync(join(destination, "application.sqlite"));
  live.exec("CREATE TABLE new_writes(value TEXT); INSERT INTO new_writes VALUES ('preserve');");
  live.close();
  assert.equal((await importManagedSeed(config)).reused, true);
  const restored = new DatabaseSync(join(destination, "application.sqlite"));
  assert.equal(restored.prepare("SELECT value FROM new_writes").get().value, "preserve");
  restored.close();
  await assert.rejects(importManagedSeed({ ...config, digest: "0".repeat(64) }), /ALREADY_INITIALIZED/);
});

test("managed import rejects a public destination", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-managed-path-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  await assert.rejects(importManagedSeed({
    key: "a".repeat(64), digest: "b".repeat(64), bundle: "/absent",
    destination: join(root, "public_html", "db"),
  }), /CONFIGURATION_INVALID/);
});
