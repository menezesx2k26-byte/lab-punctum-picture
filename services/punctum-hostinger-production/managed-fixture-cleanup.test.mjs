import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { stageOriginal, privateOriginals } from "./originals.mjs";
import { fixturePng, fixtureSha256 } from "./acceptance-fixture.mjs";
import { cleanupManagedFixture } from "./managed-fixture-cleanup.mjs";

function fixture(t, golden = false) {
  process.umask(0o077);
  const root = mkdtempSync(join(tmpdir(), "punctum-owned-cleanup-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dbFile = join(root, "application.sqlite"), originals = join(root, "originals");
  mkdirSync(originals, { mode: 0o700 });
  const db = new DatabaseSync(dbFile);
  for (const file of readdirSync(new URL("../../migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL("../../migrations/" + file, import.meta.url), "utf8"));
  }
  db.exec("PRAGMA application_id=1347767888");
  const marker = "pabcdef", albumId = randomUUID(), imageId = randomUUID(), title = "Punctum QA " + marker;
  const key = `originals/${albumId}/${imageId}.png`, createdAt = new Date().toISOString();
  db.prepare("INSERT INTO albums(id,slug,title,status,created_at,updated_at) VALUES(?,?,?,'draft',?,?)").run(albumId, "qa-" + marker, title, createdAt, createdAt);
  db.prepare("INSERT INTO images(id,album_id,original_key,mime_type,size_bytes,position,status,created_at,updated_at) VALUES(?,?,?,'image/png',?,0,'ready',?,?)")
    .run(imageId, albumId, key, fixturePng.length, createdAt, createdAt);
  db.close();
  chmodSync(dbFile, 0o600);
  stageOriginal(originals, key, fixturePng, "image/png", fixtureSha256);
  const baseline = golden ? key : "originals/preserved/source.png";
  if (!golden) stageOriginal(originals, baseline, fixturePng, "image/png", fixtureSha256);
  writeFileSync(join(root, "seed-manifest.json"), JSON.stringify({ schema: "punctum-managed-seed-v1", objects: [{ key: baseline }] }), { mode: 0o600 });
  return { config: { dbFile, originals }, baseline, key, albumId, imageId,
    data: { schema: "punctum-managed-fixture-v1", marker, sourceSha: "a".repeat(40), startedAt: createdAt,
      albums: [{ id: albumId, title }], clients: [], galleries: [], inquiries: [],
      images: [{ id: imageId, parentId: albumId, private: false, key, sha256: fixtureSha256 }] } };
}

test("cleanup removes only recorded synthetic entities and supports a repeated cleanup", { skip: process.platform !== "linux" }, async (t) => {
  const value = fixture(t);
  assert.equal((await cleanupManagedFixture(value.config, value.data, value.data.marker)).status, "OWNED_FIXTURE_REMOVED");
  assert.equal(await privateOriginals(value.config.originals).get(value.key), null);
  assert.equal((await privateOriginals(value.config.originals).get(value.baseline)).etag, fixtureSha256);
  const db = new DatabaseSync(value.config.dbFile);
  assert.equal(db.prepare("SELECT id FROM albums WHERE id=?").get(value.albumId), undefined);
  db.close();
  assert.equal((await cleanupManagedFixture(value.config, value.data, value.data.marker)).files, 0);
});

test("cleanup refuses a golden original or references outside the recorded fixture", { skip: process.platform !== "linux" }, async (t) => {
  const golden = fixture(t, true);
  await assert.rejects(cleanupManagedFixture(golden.config, golden.data, golden.data.marker), /OWNERSHIP_NOT_VERIFIED/);
  assert.equal((await privateOriginals(golden.config.originals).get(golden.key)).etag, fixtureSha256);
  const referenced = fixture(t);
  const db = new DatabaseSync(referenced.config.dbFile);
  db.prepare("UPDATE site_settings SET about_text=? WHERE id=1").run(referenced.imageId);
  await assert.rejects(cleanupManagedFixture(referenced.config, referenced.data, referenced.data.marker), /OWNERSHIP_NOT_VERIFIED/);
  assert.ok(db.prepare("SELECT id FROM albums WHERE id=?").get(referenced.albumId));
  db.close();
  assert.equal((await privateOriginals(referenced.config.originals).get(referenced.key)).etag, fixtureSha256);
});
