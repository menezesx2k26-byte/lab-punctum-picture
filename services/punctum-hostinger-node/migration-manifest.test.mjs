import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "punctum-manifest-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "source.sqlite");
  const seed = spawnSync(process.execPath, [fileURLToPath(new URL("seed.mjs", import.meta.url)), file], { encoding: "utf8" });
  assert.equal(seed.status, 0, seed.stderr);
  const sql = new DatabaseSync(file);
  const bytes = Buffer.from("synthetic-original-bytes");
  const digest = createHash("sha256").update(bytes).digest("hex");
  sql.prepare("INSERT INTO node_qa_media VALUES (?, ?, ?, ?)").run("synthetic-only", bytes, "image/png", digest);
  sql.close();
  return { directory, file };
}

test("synthetic snapshot restores every table and detects editorial divergence", async (t) => {
  const { createQaSnapshot, inspectQaManifest } = await import("./migration-manifest.mjs");
  const { directory, file } = await fixture(t);
  const target = join(directory, "restored.sqlite");
  const sourceBefore = await readFile(file);
  const manifest = await createQaSnapshot(file, target);
  assert.deepEqual(inspectQaManifest(file), manifest);
  assert.deepEqual(inspectQaManifest(target), manifest);
  assert.deepEqual(await readFile(file), sourceBefore);
  assert.equal((await stat(target)).mode & 0o077, 0);
  assert.equal(manifest.scope, "SYNTHETIC_QA_ONLY");
  assert.equal(manifest.tables.node_qa_media.rows, 1);
  assert.equal(manifest.media.objects, 1);
  assert.equal(manifest.media.bytes, 24);
  assert.ok(manifest.tables.site_config_versions);
  const restored = new DatabaseSync(target);
  restored.prepare("UPDATE site_settings SET seo_title = ? WHERE id = 1").run("Changed synthetic fixture");
  restored.close();
  assert.notEqual(inspectQaManifest(target).tables.site_settings.sha256, manifest.tables.site_settings.sha256);
  const beforeExisting = await readFile(target);
  await assert.rejects(createQaSnapshot(file, target), /exist/i);
  assert.deepEqual(await readFile(target), beforeExisting);
});

test("manifest refuses corrupted original bytes and a database without the QA identity", async (t) => {
  const { inspectQaManifest } = await import("./migration-manifest.mjs");
  const { file } = await fixture(t);
  const sql = new DatabaseSync(file);
  sql.prepare("UPDATE node_qa_media SET bytes = ?").run(Buffer.from("tampered"));
  assert.throws(() => inspectQaManifest(file), /checksum/i);
  sql.exec("PRAGMA application_id = 0");
  assert.throws(() => inspectQaManifest(file), /synthetic/i);
  sql.close();
});
