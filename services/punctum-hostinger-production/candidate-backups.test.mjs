import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidateLocalBackups } from "./candidate-backups.mjs";

test("candidateLocalBackups stores, lists, reads, deletes safely and rejects path traversal", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-cand-bak-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const bucket = candidateLocalBackups(root);
  await bucket.put("backups/d1/daily/2026-11-13/snap.json", JSON.stringify({ ok: true }), {
    httpMetadata: { contentType: "application/json" },
  });

  const listed = await bucket.list({ prefix: "backups/d1/daily/" });
  assert.equal(listed.objects.length, 1);
  assert.equal(listed.objects[0].key, "backups/d1/daily/2026-11-13/snap.json");

  const obj = await bucket.get("backups/d1/daily/2026-11-13/snap.json");
  assert.equal(await obj.text(), JSON.stringify({ ok: true }));

  await assert.rejects(() => bucket.put("../escape.json", "bad"), /CANDIDATE_BACKUP_KEY_INVALID/);

  await bucket.delete(["backups/d1/daily/2026-11-13/snap.json"]);
  assert.equal(await bucket.head("backups/d1/daily/2026-11-13/snap.json"), null);
});
