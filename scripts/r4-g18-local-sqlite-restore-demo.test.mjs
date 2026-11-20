import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { runG18LocalSqliteRestoreDemo } from "./r4-g18-local-sqlite-restore-demo.mjs";

test("G18 local synthetic SQLite backup/restore preserves 2 clients / 2 galleries / 10 objects and NUL text", () => {
  const report = runG18LocalSqliteRestoreDemo();
  try {
    assert.equal(report.result, "PASS_LOCAL_SYNTHETIC_G18_SQLITE");
    assert.equal(report.clients, 2);
    assert.equal(report.galleries, 2);
    assert.equal(report.objects, 10);
    assert.match(report.sqlSha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(report.root, { recursive: true, force: true });
  }
});
