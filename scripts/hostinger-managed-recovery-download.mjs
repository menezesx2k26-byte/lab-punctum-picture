import assert from "node:assert/strict";
import { createDecipheriv, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, chmodSync, closeSync, createReadStream, createWriteStream, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";
import { databaseInventory } from "../services/punctum-hostinger-production/managed-import.mjs";
import { candidateOriginals } from "../services/punctum-hostinger-production/candidate-originals.mjs";

process.umask(0o077);
const report = JSON.parse(readFileSync("outputs/punctum-managed-production/report.json", "utf8"));
assert.equal(report.status, "MANAGED_RECOVERY_EXPORTED_SECRETS_REMOVED");
const receipt = report.recoveryExport;
assert.equal(receipt.prefix, process.env.PUNCTUM_MANAGED_RECOVERY_PREFIX);
const key = Buffer.from(process.env.PUNCTUM_MANAGED_RECOVERY_KEY, "hex");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(sha(key), receipt.keySha256);
const root = mkdtempSync(join(tmpdir(), "punctum-reverse-restore-"));
chmodSync(root, 0o700);
try {
  const encrypted = join(root, "recovery.bin"), hash = createHash("sha256");
  writeFileSync(encrypted, "", { mode: 0o600, flag: "wx" });
  assert(receipt.chunks.length > 0 && receipt.chunks.length <= 70);
  for (const [i, chunk] of receipt.chunks.entries()) {
    assert.equal(chunk.name, String(i).padStart(4, "0") + ".bin");
    const url = "https://api.cloudflare.com/client/v4/accounts/257bca437616da74ece1ce4bbaf0bd89/r2/buckets/punctum-picture-backups/objects/" + encodeURIComponent(receipt.prefix + "/" + chunk.name);
    const response = await fetch(url, { headers: { Authorization: "Bearer " + process.env.CLOUDFLARE_API_TOKEN }, redirect: "error", signal: AbortSignal.timeout(60_000) });
    assert(response.ok && chunk.bytes <= 16 * 1024 * 1024);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, chunk.bytes); assert.equal(sha(bytes), chunk.sha256);
    hash.update(bytes); appendFileSync(encrypted, bytes);
  }
  assert.equal(statSync(encrypted).size, receipt.cipherBytes); assert.equal(hash.digest("hex"), receipt.cipherSha256);
  const fd = openSync(encrypted, "r"), iv = Buffer.alloc(12), tag = Buffer.alloc(16), size = statSync(encrypted).size;
  try { readSync(fd, iv, 0, 12, 0); readSync(fd, tag, 0, 16, size - 16); } finally { closeSync(fd); }
  const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(tag);
  const archive = join(root, "recovery.tar");
  await pipeline(createReadStream(encrypted, { start: 12, end: size - 17 }), decipher, createWriteStream(archive, { flags: "wx", mode: 0o600 }));
  const entries = execFileSync("tar", ["-tf", archive], { encoding: "utf8" }).trim().split(/\r?\n/);
  assert(new Set(entries).size === entries.length && entries.length <= 3000 && entries.every((x) => /^(?:application\.sqlite|managed-d1\.sql|recovery-manifest\.json|originals\/?|originals\/[a-f0-9]{2}\/?|originals\/[a-f0-9]{2}\/[a-f0-9]{64}\.(?:blob|json))$/.test(x)));
  assert(execFileSync("tar", ["-tvf", archive], { encoding: "utf8" }).trim().split(/\r?\n/).every((line) => ["-", "d"].includes(line[0])));
  const extracted = join(root, "restore"); mkdirSync(extracted, { mode: 0o700 });
  execFileSync("tar", ["-xf", archive, "--no-same-owner", "-C", extracted]);
  const manifest = JSON.parse(readFileSync(join(extracted, "recovery-manifest.json"), "utf8"));
  assert.deepEqual(manifest, receipt.manifest);
  const sql = join(extracted, "managed-d1.sql"); assert.equal(sha(readFileSync(sql)), manifest.sqlSha256);
  const started = performance.now(), persist = join(root, "d1");
  // --local always imports into this owned directory; the production D1 binding is never written.
  execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "punctum-picture", "--local", "--persist-to", persist, "--file", sql], { stdio: "pipe", timeout: 120_000, env: { ...process.env, CLOUDFLARE_API_TOKEN: "" } });
  const files = readdirSync(persist, { recursive: true }).filter((x) => x.endsWith(".sqlite")); assert.equal(files.length, 1);
  const db = new DatabaseSync(join(persist, files[0]), { readOnly: true });
  try {
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok"); assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const actual = databaseInventory(db);
    for (const [table, value] of Object.entries(manifest.tables)) assert.deepEqual(actual[table], value);
  } finally { db.close(); }
  let cursor, count = 0, bytes = 0; const originals = candidateOriginals(join(extracted, "originals"));
  do {
    const page = await originals.list({ cursor, limit: 1000 });
    for (const item of page.objects) {
      const object = await originals.get(item.key), data = Buffer.from(await object.arrayBuffer());
      assert.equal(sha(data), item.etag); assert.equal(data.length, item.size); count++; bytes += data.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  assert.equal(count, manifest.objects); assert.equal(bytes, manifest.bytes);
  const result = { status: "MANAGED_R2_TO_LOCAL_D1_RESTORE_VERIFIED", remoteD1RestoreVerified: false,
    objects: count, bytes, sqlSha256: manifest.sqlSha256, cipherSha256: receipt.cipherSha256,
    tables: manifest.tables, restoreMs: Math.round(performance.now() - started) };
  writeFileSync("outputs/punctum-managed-production/reverse-restore.json", JSON.stringify(result));
  console.log(JSON.stringify(result));
} finally { key.fill(0); rmSync(root, { recursive: true, force: true }); }
