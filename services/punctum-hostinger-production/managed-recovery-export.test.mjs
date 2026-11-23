import test from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { exportManagedRecovery } from "./managed-recovery-export.mjs";
import { productionStageApplicationId } from "./sqlite.mjs";
import { stageOriginal } from "./originals.mjs";

test("recovery transport rejects incomplete credentials and unrelated remote prefixes before storage work", async () => {
  const config = { managed: true, environment: "staging" };
  await assert.rejects(exportManagedRecovery(config, {}), /PREFIX_INVALID/);
  await assert.rejects(exportManagedRecovery(config, { PUNCTUM_MANAGED_RECOVERY_PREFIX: "managed-recovery/snapshot-" + "a".repeat(32) }), /CREDENTIALS_REQUIRED/);
  await assert.rejects(exportManagedRecovery({ ...config, environment: "production" }, {}), /STAGING_REQUIRED/);
});

test("encrypted managed export restores all current rows and files, detects corruption and cleans only its own partial upload", { skip: process.platform !== "linux" }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-reverse-transfer-test-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const originals = join(root, "originals"), dbFile = join(root, "application.sqlite");
  mkdirSync(originals, { mode: 0o700 });
  const blob = Buffer.from("owned fixture bytes"), digest = createHash("sha256").update(blob).digest("hex");
  stageOriginal(originals, "originals/fixture.bin", blob, "image/png", digest);
  const db = new DatabaseSync(dbFile);
  db.exec(`PRAGMA application_id=${productionStageApplicationId};
    CREATE TABLE albums(id TEXT PRIMARY KEY,title TEXT);
    CREATE TABLE images(id TEXT PRIMARY KEY,album_id TEXT REFERENCES albums(id),original_key TEXT,status TEXT);
    INSERT INTO albums VALUES('kept','before'),('deleted','before');
    UPDATE albums SET title='edited after migration' WHERE id='kept';
    DELETE FROM albums WHERE id='deleted';
    INSERT INTO albums VALUES('new','created after migration');
    INSERT INTO images VALUES('image','new','originals/fixture.bin','ready');`);
  const expected = db.prepare("SELECT * FROM albums ORDER BY id").all();
  db.close(); chmodSync(dbFile, 0o600);
  const env = { PUNCTUM_MANAGED_RECOVERY_PREFIX: "managed-recovery/snapshot-" + "a".repeat(32),
    PUNCTUM_MANAGED_RECOVERY_KEY: "b".repeat(64), CLOUDFLARE_API_TOKEN: "offline-transport-token" };
  const remote = new Map([["preserved-unrelated-object", Buffer.from("keep")]]);
  let corrupt = false;
  const request = async (url, options) => {
    assert(url.startsWith("https://api.cloudflare.com/client/v4/accounts/257bca437616da74ece1ce4bbaf0bd89/r2/buckets/punctum-picture-backups/objects/"));
    const key = decodeURIComponent(new URL(url).pathname.split("/objects/")[1]);
    assert(key.startsWith(env.PUNCTUM_MANAGED_RECOVERY_PREFIX + "/"));
    if (options.method === "PUT") remote.set(key, Buffer.from(options.body));
    if (options.method === "DELETE") remote.delete(key);
    return new Response(options.method === "GET" ? corrupt ? "corrupt" : remote.get(key) : "{}", { status: 200 });
  };
  const receipt = await exportManagedRecovery({ managed: true, environment: "staging", dbFile, originals }, env, request);
  const encrypted = Buffer.concat(receipt.chunks.map((item) => remote.get(receipt.prefix + "/" + item.name)));
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(env.PUNCTUM_MANAGED_RECOVERY_KEY, "hex"), encrypted.subarray(0, 12));
  decipher.setAuthTag(encrypted.subarray(-16));
  const archive = join(root, "verified.tar"), extracted = join(root, "extracted");
  mkdirSync(extracted, { mode: 0o700 });
  writeFileSync(archive, Buffer.concat([decipher.update(encrypted.subarray(12, -16)), decipher.final()]));
  execFileSync("tar", ["-xf", archive, "-C", extracted]);
  const target = new DatabaseSync(":memory:");
  try {
    target.exec("BEGIN;" + readFileSync(join(extracted, "managed-d1.sql"), "utf8") + "COMMIT;");
    assert.deepEqual(target.prepare("SELECT * FROM albums ORDER BY id").all(), expected);
    assert.deepEqual(target.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { target.close(); }
  assert.equal(receipt.manifest.objects, 1);
  assert.equal(receipt.manifest.bytes, blob.length);
  assert.deepEqual(readdirSync(join(root, "managed-recovery")), []);
  env.PUNCTUM_MANAGED_RECOVERY_PREFIX = "managed-recovery/snapshot-" + "c".repeat(32);
  corrupt = true;
  await assert.rejects(exportManagedRecovery({ managed: true, environment: "staging", dbFile, originals }, env, request), /TRANSPORT_MISMATCH/);
  assert(![...remote.keys()].some((key) => key.startsWith(env.PUNCTUM_MANAGED_RECOVERY_PREFIX)));
  assert(remote.has("preserved-unrelated-object"));
});

for (const failure of [false, true]) test(`export removes owned plaintext archives on ${failure ? "transport failure" : "success"} and preserves retained files`, { skip: process.platform !== "linux" }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-export-cleanup-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const originals = join(root, "originals"), dbFile = join(root, "application.sqlite"), recovery = join(root, "managed-recovery");
  mkdirSync(originals, { mode: 0o700 });
  mkdirSync(recovery, { mode: 0o700 });
  const retained = ["daily-2026-11-21-11111111-1111-1111-1111-111111111111.tar", "retained-proof.tar", "unrelated.txt"];
  for (const name of retained) writeFileSync(join(recovery, name), "preserve", { mode: 0o600 });
  const db = new DatabaseSync(dbFile);
  db.exec(`PRAGMA application_id=${productionStageApplicationId}; CREATE TABLE synthetic(value TEXT); INSERT INTO synthetic VALUES('keep')`);
  db.close(); chmodSync(dbFile, 0o600);
  const env = { PUNCTUM_MANAGED_RECOVERY_PREFIX: "managed-recovery/snapshot-" + "d".repeat(32),
    PUNCTUM_MANAGED_RECOVERY_KEY: "e".repeat(64), CLOUDFLARE_API_TOKEN: "offline-test-only" };
  const remote = new Map();
  const request = async (url, options) => {
    if (failure && options.method === "PUT") throw Error("SYNTHETIC_TRANSPORT_FAILURE");
    if (options.method === "PUT") remote.set(url, Buffer.from(options.body));
    if (options.method === "DELETE") remote.delete(url);
    return new Response(options.method === "GET" ? remote.get(url) : "{}");
  };
  const exporting = exportManagedRecovery({ managed: true, environment: "staging", dbFile, originals }, env, request);
  if (failure) await assert.rejects(exporting, /SYNTHETIC_TRANSPORT_FAILURE/);
  else assert.equal((await exporting).status, "MANAGED_ENCRYPTED_RECOVERY_EXPORTED");
  assert.deepEqual(readdirSync(recovery).sort(), retained.sort());
  for (const name of retained) assert.equal(readFileSync(join(recovery, name), "utf8"), "preserve");
  assert.equal(readFileSync(dbFile).subarray(0, 15).toString(), "SQLite format 3");
});
