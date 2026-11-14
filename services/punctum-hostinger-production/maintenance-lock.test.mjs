import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMaintenanceLock } from "../../cron.mjs";

test("maintenance jobs exclude concurrent runs and release their own lock after errors", { skip: process.platform === "win32" }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-lock-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  await withMaintenanceLock(root, async () => {
    assert.equal(existsSync(join(root, "maintenance.lock")), true);
    await assert.rejects(withMaintenanceLock(root, async () => assert.fail()), /MAINTENANCE_BUSY/);
  });
  await assert.rejects(withMaintenanceLock(root, async () => { throw Error("test-failure"); }), /test-failure/);
  assert.equal(existsSync(join(root, "maintenance.lock")), false);
  assert.equal(await withMaintenanceLock(root, async () => "ok"), "ok");
});
