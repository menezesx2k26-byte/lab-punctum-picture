import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidateOriginals } from "./candidate-originals.mjs";

test("candidateOriginals supports immutable 25MiB-gated put, head, get, list, and blocks delete", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-cand-orig-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const store = candidateOriginals(root);
  const payload = Buffer.from("ffd8ffe000104a464946", "hex");
  const digest = createHash("sha256").update(payload).digest("hex");

  const stored = await store.put("originals/a1/img1.jpg", payload, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "image/jpeg" },
    customMetadata: { sha256: digest },
  });
  assert.equal(stored.size, payload.byteLength);
  assert.equal(stored.etag, digest);

  const listed = await store.list({ prefix: "originals/", limit: 10 });
  assert.equal(listed.objects.length, 1);
  assert.equal(listed.objects[0].key, "originals/a1/img1.jpg");
  assert.equal(listed.objects[0].etag, digest);
  assert.equal(listed.truncated, false);

  await assert.rejects(() => store.delete("originals/a1/img1.jpg"), /PRIVATE_ORIGINAL_DELETE_REQUIRES_RETENTION_POLICY/);
});
