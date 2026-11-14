import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidateConfig } from "./candidate-runtime.mjs";
import { productionStageApplicationId } from "./sqlite.mjs";

test("candidateConfig validates isolated private candidate environment and rejects unsafe paths", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-cand-rt-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const dbDir = join(root, "db");
  const origDir = join(root, "originals");
  const bakDir = join(root, "backups");
  mkdirSync(dbDir, { mode: 0o700 });
  mkdirSync(origDir, { mode: 0o700 });
  mkdirSync(bakDir, { mode: 0o700 });
  const dbFile = join(dbDir, "candidate.sqlite");
  const db = new DatabaseSync(dbFile);
  db.exec(`PRAGMA application_id = ${productionStageApplicationId};`);
  db.close();
  chmodSync(dbFile, 0o600);

  const saved = { ...process.env };
  t.after(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("PUNCTUM_")) delete process.env[k];
    }
    Object.assign(process.env, saved);
  });

  process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE = "private-candidate";
  process.env.PUNCTUM_CANDIDATE_ENVIRONMENT = "staging";
  process.env.PUNCTUM_CANDIDATE_ORIGIN = "http://127.0.0.1:3025";
  process.env.PUNCTUM_CANDIDATE_PUBLIC_URL = "https://127.0.0.1:8443";
  process.env.PUNCTUM_CANDIDATE_DB_FILE = dbFile;
  process.env.PUNCTUM_CANDIDATE_ORIGINALS = origDir;
  process.env.PUNCTUM_CANDIDATE_BACKUPS_ROOT = bakDir;
  process.env.PUNCTUM_CANDIDATE_ADMIN_EMAIL = "admin@punctumpicture.com";
  process.env.PUNCTUM_CANDIDATE_ADMIN_SESSION_SECRET = "a".repeat(48);
  process.env.PUNCTUM_CANDIDATE_CLIENT_SESSION_SECRET = "b".repeat(48);

  const cfg = candidateConfig();
  assert.equal(cfg.environment, "staging");
  assert.equal(cfg.origin.port, "3025");
  assert.equal(cfg.publicOrigin.origin, "https://127.0.0.1:8443");
  assert.equal(cfg.trustedProxy, "caddy");

  process.env.PUNCTUM_CANDIDATE_ORIGIN = "https://0.0.0.0:3025";
  assert.throws(() => candidateConfig(), /CANDIDATE_LISTEN_ORIGIN_INVALID/);
});
