import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { qaDatabasePath } from "./runtime.mjs";

test("QA rejects a database inside public or deployment-managed directories", (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-path-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const previous = process.env.PUNCTUM_QA_DB_FILE;
  t.after(() => { if (previous === undefined) delete process.env.PUNCTUM_QA_DB_FILE; else process.env.PUNCTUM_QA_DB_FILE = previous; });
  for (const directory of ["public_html", "hbuilds/current/nodejs", "dist/hostinger-qa/client", "public"]) {
    const parent = join(root, directory);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    const file = join(parent, "synthetic.sqlite");
    writeFileSync(file, "synthetic", { mode: 0o600 });
    process.env.PUNCTUM_QA_DB_FILE = file;
    assert.throws(() => qaDatabasePath(), /private|deployment/i, directory);
  }
});

test("QA rejects a private-looking symlink whose target is deployed publicly", (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-path-link-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const previous = process.env.PUNCTUM_QA_DB_FILE;
  t.after(() => { if (previous === undefined) delete process.env.PUNCTUM_QA_DB_FILE; else process.env.PUNCTUM_QA_DB_FILE = previous; });
  mkdirSync(join(root, "public_html"));
  writeFileSync(join(root, "public_html", "qa.sqlite"), "synthetic", { mode: 0o600 });
  symlinkSync(join(root, "public_html"), join(root, "private"));
  process.env.PUNCTUM_QA_DB_FILE = join(root, "private", "qa.sqlite");
  assert.throws(() => qaDatabasePath(), /private|deployment/i);
});

test("QA accepts owner-only storage and rejects readable database or directory permissions", (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-path-mode-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const previous = process.env.PUNCTUM_QA_DB_FILE;
  t.after(() => { if (previous === undefined) delete process.env.PUNCTUM_QA_DB_FILE; else process.env.PUNCTUM_QA_DB_FILE = previous; });
  const file = join(root, "qa.sqlite");
  writeFileSync(file, "synthetic", { mode: 0o600 });
  process.env.PUNCTUM_QA_DB_FILE = file;
  assert.equal(qaDatabasePath(), file);
  chmodSync(file, 0o644);
  assert.throws(() => qaDatabasePath(), /private|permissions/i);
  chmodSync(file, 0o600);
  chmodSync(root, 0o755);
  assert.throws(() => qaDatabasePath(), /private|permissions/i);
});
