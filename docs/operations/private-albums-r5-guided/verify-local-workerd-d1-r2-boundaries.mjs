/**
 * Documentation-only runtime experiment, NOT R5 product acceptance.
 * Run: node docs/operations/private-albums-r5-guided/verify-local-workerd-d1-r2-boundaries.mjs
 * Requires existing local miniflare dependency; no production or remote D1/R2.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const require = createRequire(join(process.cwd(), "package.json"));
const { Miniflare, convertV4MiniflareOptions } =
  await import(pathToFileURL(require.resolve("miniflare")).href);
const root = await mkdtemp(join(tmpdir(), "punctum-r5-d1-local-"));
await writeFile(join(root, "worker.mjs"),
  "export default {fetch(){return new Response(String(1))}}");
const options = convertV4MiniflareOptions({
  name: "r5-documentation-runtime-probe",
  modules: [{ type: "ESModule", path: join(root, "worker.mjs") }],
  modulesRoot: root,
  compatibilityDate: "2026-05-22",
  d1Databases: { DB: "r5-isolated-d1" },
  r2Buckets: { ORIGINALS: "r5-isolated-r2" },
});
options.resourcePersistencePath = join(root, "persistence");
options.telemetry = { enabled: false };

const checks = [];
const check = (name, actual, expected) =>
  checks.push({ name, actual, expected, pass: actual === expected });
const count = async (db, table, where = "1=1") =>
  (await db.prepare("SELECT count(*) AS n FROM " + table + " WHERE " + where).first()).n;
let mf;
try {
  mf = new Miniflare(options);
  await mf.ready;
  const db = await mf.getD1Database("DB");
  const r2 = await mf.getR2Bucket("ORIGINALS");
  await db.exec("CREATE TABLE state(id TEXT PRIMARY KEY,rev INT NOT NULL); CREATE TABLE events(id TEXT PRIMARY KEY); CREATE TABLE guard(ok INT CHECK(ok=1));");
  await db.prepare("INSERT INTO state VALUES('GA',0)").run();

  const stale = await db.batch([
    db.prepare("UPDATE state SET rev=rev+1 WHERE id='GA' AND rev=9"),
    db.prepare("INSERT INTO events VALUES('unsafe')"),
  ]);
  check("stale_CAS_changes_zero", stale[0].meta.changes, 0);
  check("D1_batch_commits_after_zero_row_CAS", await count(db, "events", "id='unsafe'"), 1);

  let constraintError = false;
  try {
    await db.batch([
      db.prepare("UPDATE state SET rev=rev+1 WHERE id='GA' AND rev=0"),
      db.prepare("INSERT INTO events VALUES('rollback')"),
      db.prepare("INSERT INTO guard VALUES(0)"),
    ]);
  } catch { constraintError = true; }
  check("failed_D1_batch_throws", constraintError, true);
  check("failed_D1_batch_restores_revision",
    (await db.prepare("SELECT rev FROM state WHERE id='GA'").first()).rev, 0);
  check("failed_D1_batch_does_not_commit_event",
    await count(db, "events", "id='rollback'"), 0);

  let staleGuardThrows = false;
  try {
    await db.batch([
      db.prepare("UPDATE state SET rev=rev+1 WHERE id='GA' AND rev=99"),
      db.prepare("INSERT INTO guard SELECT changes()"),
      db.prepare("INSERT INTO events VALUES('bad-receipt')"),
    ]);
  } catch { staleGuardThrows = true; }
  check("changes_guard_aborts_stale_batch", staleGuardThrows, true);
  check("guarded_stale_batch_no_event", await count(db, "events", "id='bad-receipt'"), 0);
  check("guarded_stale_batch_revision_unchanged",
    (await db.prepare("SELECT rev FROM state WHERE id='GA'").first()).rev, 0);

  const valid = await db.batch([
    db.prepare("UPDATE state SET rev=rev+1 WHERE id='GA' AND rev=0"),
    db.prepare("INSERT INTO guard SELECT changes()"),
    db.prepare("INSERT INTO events VALUES('valid')"),
  ]);
  check("guarded_valid_CAS_changes_one", valid[0].meta.changes, 1);
  check("guarded_valid_CAS_commits_event", await count(db, "events", "id='valid'"), 1);
  check("guarded_valid_CAS_commits_revision",
    (await db.prepare("SELECT rev FROM state WHERE id='GA'").first()).rev, 1);

  const competitors = await Promise.all([
    db.prepare("UPDATE state SET rev=rev+1 WHERE id='GA' AND rev=1").run(),
    db.prepare("UPDATE state SET rev=rev+1 WHERE id='GA' AND rev=1").run(),
  ]);
  check("two_D1_CAS_writes_one_winner",
    competitors.map(x => x.meta.changes).sort().join(","), "0,1");
  check("D1_CAS_final_revision_is_two",
    (await db.prepare("SELECT rev FROM state WHERE id='GA'").first()).rev, 2);

  await r2.put("orphan/sha256-synthetic", "synthetic bytes, no photos");
  check("local_R2_stage_visible", Boolean(await r2.head("orphan/sha256-synthetic")), true);
  let duplicateRejected = false;
  try {
    await db.batch([
      db.prepare("INSERT INTO events VALUES('valid')"),
      db.prepare("INSERT INTO events VALUES('never-persisted')"),
    ]);
  } catch { duplicateRejected = true; }
  check("D1_duplicate_throws_without_changing_R2", duplicateRejected, true);
  check("R2_object_survives_D1_rollback",
    Boolean(await r2.head("orphan/sha256-synthetic")), true);
  check("D1_rollback_does_not_commit_second_event",
    await count(db, "events", "id='never-persisted'"), 0);

  const report = {
    kind: "LOCAL_MINIFLARE_WORKERD_D1_R2_CONTRACT_EXPERIMENT_NOT_R5_HOMOLOGATION",
    checks,
    passed: checks.filter(x => x.pass).length,
    total: checks.length,
    cloudflareAccountCalls: 0,
    productCodeModified: false,
    r5FeatureTests: 0,
    limitations: "synthetic schema and minimal worker, no migration 0010 or real user data",
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.passed !== report.total) process.exitCode = 1;
} finally {
  await mf?.dispose();
  await rm(root, { recursive: true, force: true });
}