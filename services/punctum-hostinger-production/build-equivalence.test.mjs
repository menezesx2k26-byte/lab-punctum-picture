import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareCandidateBuilds } from "../../scripts/hostinger-candidate-build-equivalence.mjs";

const manifest = "server/vinext-server.json";
const ssrManifest = "server/ssr/vinext-server.json";
const bundle = "server/index.js";
const asset = "client/site.txt";
const draftA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draftB = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";
const buildA = "cccccccc-cccc-4ccc-accc-cccccccccccc";
const buildB = "dddddddd-dddd-4ddd-bddd-dddddddddddd";
const prerenderA = "a".repeat(64);
const prerenderB = "b".repeat(64);
const manifestWith = (secret) => JSON.stringify({ prerenderSecret: secret });
const bundleWith = (secret, buildId) => `
function getDraftSecret() { return "${secret}"; }
const request = { get buildId() { return "${buildId}"; } };
function appIsrCacheKey(pathname, suffix, buildId = "${buildId}") {}
const graph = { deploymentVersion: "${buildId}", rootBoundaryId };
`;

function builds(t) {
  const root = mkdtempSync(join(tmpdir(), "punctum-build-compare-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const a = join(root, "a");
  const b = join(root, "b");
  for (const [dir, draft, prerender, buildId] of [[a, draftA, prerenderA, buildA], [b, draftB, prerenderB, buildB]]) {
    mkdirSync(join(dir, "server", "ssr"), { recursive: true });
    mkdirSync(join(dir, "client"));
    writeFileSync(join(dir, manifest), manifestWith(prerender));
    writeFileSync(join(dir, ssrManifest), manifestWith(prerender));
    writeFileSync(join(dir, bundle), bundleWith(draft, buildId));
    writeFileSync(join(dir, asset), "same asset");
  }
  return { a, b };
}

test("accepts only generated Vinext values and counts SHA-256 matches", (t) => {
  const { a, b } = builds(t);
  assert.deepEqual(compareCandidateBuilds(a, b), {
    filesCompared: 4,
    byteIdentical: 1,
    normalizedFiles: [bundle, ssrManifest, manifest],
  });
});

test("rejects differing inventories and public assets", (t) => {
  const { a, b } = builds(t);
  writeFileSync(join(b, asset), "different asset");
  assert.throws(() => compareCandidateBuilds(a, b), /UNEXPECTED_BUILD_DRIFT.*client\/site\.txt/);
  rmSync(join(b, asset));
  assert.throws(() => compareCandidateBuilds(a, b), /BUILD_INVENTORY_MISMATCH/);
});

test("rejects bundle changes outside the exact Draft Mode binding", (t) => {
  const { a, b } = builds(t);
  writeFileSync(join(b, bundle), bundleWith(draftB, buildB) + `const other = "${draftB}";\n`);
  assert.throws(() => compareCandidateBuilds(a, b), /UNEXPECTED_BUILD_DRIFT.*server\/index\.js/);
  writeFileSync(join(b, bundle), bundleWith(draftB, buildB).repeat(2));
  assert.throws(() => compareCandidateBuilds(a, b), /INVALID_VINEXT_DRAFT_BINDING/);
});

test("requires strict manifests with matching secrets within each build", (t) => {
  const { a, b } = builds(t);
  writeFileSync(join(b, ssrManifest), manifestWith(prerenderA));
  assert.throws(() => compareCandidateBuilds(a, b), /VINEXT_PRERENDER_SECRET_MISMATCH/);
  writeFileSync(join(b, ssrManifest), JSON.stringify({ prerenderSecret: prerenderB, other: true }));
  assert.throws(() => compareCandidateBuilds(a, b), /INVALID_VINEXT_SERVER_MANIFEST/);
});

test("rejects reused build secrets", (t) => {
  const { a, b } = builds(t);
  writeFileSync(join(b, bundle), bundleWith(draftA, buildB));
  assert.throws(() => compareCandidateBuilds(a, b), /VINEXT_SECRET_REUSED/);
  writeFileSync(join(b, bundle), bundleWith(draftB, buildB));
  writeFileSync(join(b, manifest), manifestWith(prerenderA));
  writeFileSync(join(b, ssrManifest), manifestWith(prerenderA));
  assert.throws(() => compareCandidateBuilds(a, b), /VINEXT_SECRET_REUSED/);
});

test("requires the same build ID in all three Vinext uses and preserves unrelated UUIDs", (t) => {
  const { a, b } = builds(t);
  writeFileSync(join(b, bundle), bundleWith(draftB, buildB).replace(`deploymentVersion: "${buildB}"`, `deploymentVersion: "${buildA}"`));
  assert.throws(() => compareCandidateBuilds(a, b), /VINEXT_BUILD_ID_MISMATCH/);
  writeFileSync(join(b, bundle), bundleWith(draftB, buildA));
  assert.throws(() => compareCandidateBuilds(a, b), /VINEXT_BUILD_ID_REUSED/);
  writeFileSync(join(a, bundle), bundleWith(draftA, buildA) + `const hero = "${buildA}";\n`);
  writeFileSync(join(b, bundle), bundleWith(draftB, buildB) + `const hero = "${buildB}";\n`);
  assert.throws(() => compareCandidateBuilds(a, b), /UNEXPECTED_BUILD_DRIFT.*server\/index\.js/);
});
