import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCandidateWritableDatabase } from "./candidate-sqlite.mjs";
import { productionStageApplicationId } from "./sqlite.mjs";

function makeTempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "punctum-cand-db-"));
  chmodSync(dir, 0o700);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function createStageDb(file, appId = productionStageApplicationId) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA application_id = ${appId};`);
  db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);");
  db.close();
  chmodSync(file, 0o600);
}

test("requires explicit private-candidate mode and forbids golden export paths", async (t) => {
  const dir = makeTempDir(t);
  const dbFile = join(dir, "application.sqlite");
  createStageDb(dbFile);

  const prev = process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE;
  delete process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE;
  t.after(() => {
    if (prev === undefined) delete process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE;
    else process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE = prev;
  });

  assert.throws(
    () => openCandidateWritableDatabase(dbFile, { candidateMode: "PRIVATE_PRODUCTION_CANDIDATE" }),
    /CANDIDATE_D1_MODE_REQUIRED/,
  );

  process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE = "private-candidate";
  const forbiddenDir = join(dir, "production-import-20261113");
  mkdirSync(forbiddenDir, { mode: 0o700 });
  const forbiddenFile = join(forbiddenDir, "application-staged.sqlite");
  createStageDb(forbiddenFile);
  assert.throws(
    () => openCandidateWritableDatabase(forbiddenFile, { candidateMode: "PRIVATE_PRODUCTION_CANDIDATE" }),
    /CANDIDATE_D1_GOLDEN_SNAPSHOT_FORBIDDEN/,
  );
});

test("rejects synthetic QA application id and supports atomic batch rollback", async (t) => {
  const dir = makeTempDir(t);
  const qaFile = join(dir, "qa.sqlite");
  createStageDb(qaFile, 0x50554e51);
  const realFile = join(dir, "candidate.sqlite");
  createStageDb(realFile, productionStageApplicationId);

  const prev = process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE;
  process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE = "private-candidate";
  t.after(() => {
    if (prev === undefined) delete process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE;
    else process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE = prev;
  });

  assert.throws(
    () => openCandidateWritableDatabase(qaFile, { candidateMode: "PRIVATE_PRODUCTION_CANDIDATE" }),
    /CANDIDATE_D1_ID_OR_INTEGRITY_INVALID/,
  );

  const db = openCandidateWritableDatabase(realFile, { candidateMode: "PRIVATE_PRODUCTION_CANDIDATE" });
  t.after(() => db.close());

  await db.batch([
    db.prepare("INSERT INTO items (id, name) VALUES (?, ?)").bind(1, "alpha"),
  ]);
  await assert.rejects(() =>
    db.batch([
      db.prepare("INSERT INTO items (id, name) VALUES (?, ?)").bind(2, "beta"),
      db.prepare("INSERT INTO items (id, name) VALUES (?, ?)").bind(1, "dup"),
    ]),
  );
  const rows = await db.prepare("SELECT id, name FROM items ORDER BY id").all();
  assert.deepEqual(rows.results.map((r) => ({ ...r })), [{ id: 1, name: "alpha" }]);
});
