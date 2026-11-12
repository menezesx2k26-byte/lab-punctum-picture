import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openQaDatabase } from "./sqlite.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "punctum-sqlite-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "synthetic.sqlite");
  const seed = spawnSync(process.execPath, [fileURLToPath(new URL("seed.mjs", import.meta.url)), file], { encoding: "utf8" });
  assert.equal(seed.status, 0, seed.stderr);
  const sql = new DatabaseSync(file);
  sql.exec("CREATE TABLE concurrency_fixture (id INTEGER PRIMARY KEY, value INTEGER NOT NULL); INSERT INTO concurrency_fixture VALUES (1, 0)");
  sql.close();
  return file;
}

test("SQLite RETURNING reports affected rows for compare-and-swap writes", async (t) => {
  const file = await fixture(t);
  const db = openQaDatabase(file);
  t.after(() => db.close());
  const changed = await db.prepare("UPDATE concurrency_fixture SET value = 7 WHERE id = 1 AND value = 0 RETURNING value").run();
  assert.equal(changed.meta.changes, 1);
  assert.equal(changed.results[0].value, 7);
  const unchanged = await db.prepare("UPDATE concurrency_fixture SET value = 8 WHERE id = 1 AND value = 0 RETURNING value").run();
  assert.equal(unchanged.meta.changes, 0);
  assert.equal(unchanged.results.length, 0);
  assert.equal((await db.prepare("SELECT value FROM concurrency_fixture").all()).meta.changes, 0);
});

function writer(t, file, code) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { openQaDatabase } from ${JSON.stringify(new URL("sqlite.mjs", import.meta.url).href)};
    const db = openQaDatabase(${JSON.stringify(file)});
    ${code}
  `], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const exited = once(child, "exit");
  let errors = "";
  child.stderr.setEncoding("utf8").on("data", value => { errors += value; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  });
  return { child, exited, errors: () => errors };
}

test("independent SQLite writers wait for a lock and preserve every committed increment", { timeout: 15000 }, async (t) => {
  const file = await fixture(t);
  const lock = new DatabaseSync(file, { timeout: 5000 });
  t.after(() => lock.close());
  lock.exec("BEGIN IMMEDIATE");
  const code = `process.send("attempting");
    for (let i = 0; i < 40; i++) await db.batch([db.prepare("UPDATE concurrency_fixture SET value = value + 1 WHERE id = 1")]);
    db.close(); process.disconnect();`;
  const writers = [writer(t, file, code), writer(t, file, code)];
  await Promise.all(writers.map(x => once(x.child, "message")));
  lock.exec("COMMIT");
  for (const child of writers) assert.equal((await child.exited)[0], 0, child.errors());
  assert.equal(lock.prepare("SELECT value FROM concurrency_fixture").get().value, 80);
  assert.equal(lock.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.equal(lock.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("process interruption rolls back an uncommitted SQLite write on reopen", { timeout: 10000 }, async (t) => {
  const file = await fixture(t);
  // Use a real process and an open transaction; only this synthetic process is killed.
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { DatabaseSync } from "node:sqlite";
    const sql = new DatabaseSync(${JSON.stringify(file)});
    sql.exec("BEGIN IMMEDIATE; UPDATE concurrency_fixture SET value = 99 WHERE id = 1");
    process.send("uncommitted"); setInterval(() => {}, 1000);
  `], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const exited = once(child, "exit");
  t.after(async () => { if (child.signalCode === null && child.exitCode === null) child.kill("SIGKILL"); await exited; });
  assert.equal((await once(child, "message"))[0], "uncommitted");
  child.kill("SIGKILL");
  assert.equal((await exited)[1], "SIGKILL");
  const db = openQaDatabase(file);
  t.after(() => db.close());
  assert.equal(await db.prepare("SELECT value FROM concurrency_fixture").first("value"), 0);
  assert.equal(await db.prepare("PRAGMA integrity_check").first("integrity_check"), "ok");
});
