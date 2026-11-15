import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMaintenanceLock } from "../../cron.mjs";

test("cron recognizes the provider's current-build symlink as its CLI entry", { skip: process.platform !== "linux" }, (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-cron-symlink-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const entry = join(root, "cron.mjs");
  symlinkSync(fileURLToPath(new URL("../../cron.mjs", import.meta.url)), entry);
  const result = spawnSync(process.execPath, [entry, "hourly"], {
    env: { ...process.env, PUNCTUM_PRODUCTION_CANDIDATE_MODE: "" }, encoding: "utf8", timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CANDIDATE_OPT_IN_REQUIRED/);
});

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
