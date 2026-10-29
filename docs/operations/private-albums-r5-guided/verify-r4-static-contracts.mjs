/**
 * Read-only R4/R5 static contract inventory. No dependencies, writes, remote calls,
 * requests, deployments, secrets or test fixtures. This is NOT a security test.
 *
 * Usage from any cwd: node docs/operations/private-albums-r5-guided/verify-r4-static-contracts.mjs
 * Output: JSON with MATCH/MISMATCH, source Git HEAD and evidence; exit 1 for drift.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = (path) => readFileSync(resolve(root, path), "utf8");
const map = Object.fromEntries([
  "worker/client/router.ts",
  "worker/media/private-gallery.ts",
  "worker/client/repository.ts",
  "worker/api/client-admin.ts",
  "worker/api/client-galleries.ts",
  "worker/api/client-gallery-upload.ts",
  "worker/client/response.ts",
  "shared/client-galleries.ts",
  "app/albuns/components/PrivateGallery.tsx",
  "app/albuns/components/PhotoViewer.tsx",
  "app/albuns/components/responses.ts",
  "migrations/0009_private_client_galleries.sql",
  "tests/integration/client-security-matrix.spec.ts",
].map((path) => [path, source(path)]));
const s = (path) => map[path];
const has = (path, value) => s(path).includes(value);
const check = [
  ["r4-flag", "existing-control", () => has("worker/client/router.ts", "PRIVATE_GALLERIES_ENABLED") && has("worker/client/router.ts", "!isPrivateGalleriesEnabled(env)")],
  ["r4-auth-dispatch", "existing-control", () => has("worker/client/router.ts", "requireClient")],
  ["r4-owner-sql", "existing-control", () => has("worker/client/repository.ts", "g.client_id=? AND g.status='published'")],
  ["r4-zero-byte-test-source", "existing-test-source", () => has("tests/integration/client-security-matrix.spec.ts", "bytes.byteLength") && has("tests/integration/client-security-matrix.spec.ts", "toBe(0)")],
  ["r4-media-ownership", "existing-control", () => has("worker/media/private-gallery.ts", "getOwnedGallery(db, identity.id, galleryId)") && has("worker/media/private-gallery.ts", "headOnly")],
  ["r4-cache-denial", "existing-control", () => has("worker/client/response.ts", "private, no-store") && has("worker/client/response.ts", "noindex, nofollow")],
  ["r4-origin-checks", "existing-control", () => has("worker/api/client-admin.ts", "assertAllowedOrigin") && has("worker/api/client-galleries.ts", "assertAllowedOrigin")],
  ["r4-raw-download", "r5-gap", () => has("worker/media/private-gallery.ts", "new Response(object.body") && has("worker/media/private-gallery.ts", 'preset === "download"')],
  ["r4-no-watermark-in-transform", "r5-gap", () => has("worker/media/private-gallery.ts", ".transform({") && !/watermark|overlay|drawText|composite/i.test(s("worker/media/private-gallery.ts"))],
  ["r4-publish-no-selection", "r5-gap", () => has("worker/api/client-admin.ts", "cover_image_id") && has("worker/api/client-admin.ts", "status='published'") && !has("worker/api/client-admin.ts", "selection_revision")],
  ["r4-schema-no-selection", "r5-gap", () => has("migrations/0009_private_client_galleries.sql", "client_gallery_favorites") && !has("migrations/0009_private_client_galleries.sql", "client_selection_revisions")],
  ["r4-ui-original-download", "r5-gap", () => has("app/albuns/components/PhotoViewer.tsx", "Baixar original")],
  ["r4-dialog-focus-escape", "existing-control", () => has("app/albuns/components/PhotoViewer.tsx", "previous?.focus()") && has("app/albuns/components/PhotoViewer.tsx", "onCancel")],
  ["r4-dialog-aria-count", "existing-control", () => has("app/albuns/components/PhotoViewer.tsx", 'aria-live="polite"')],
  ["r4-response-unknown-fallback", "r5-integration-gap", () => has("app/albuns/components/responses.ts", "return true;\n}")],
  ["r4-upload-buffering", "capacity-risk", () => has("worker/api/client-gallery-upload.ts", "chunks.push(item.value)") && has("worker/api/client-gallery-upload.ts", "new Uint8Array(total)")],
  ["r4-image-validation-fail-closed", "existing-control", () => has("worker/api/client-gallery-upload.ts", "IMAGE_VALIDATION_UNAVAILABLE")],
  ["r4-image-preview-fail-closed", "existing-control", () => has("worker/media/private-gallery.ts", "IMAGE_SERVICE_UNAVAILABLE")],
];
const items = check.map(([id,kind,predicate]) => ({
  id, kind, result: predicate() ? "MATCH" : "MISMATCH",
}));
let head = null;
try { head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); }
catch { /* Git HEAD may be unknown if file was copied outside repo. */ }
const report = {
  kind: "READ_ONLY_LITERAL_SOURCE_INVENTORY",
  warning: "MATCH means source text matched expected pattern. It is not a test PASS, formal review, or runtime authorization proof.",
  gitHead: head,
  checks: items.length,
  matched: items.filter((x) => x.result === "MATCH").length,
  mismatched: items.filter((x) => x.result === "MISMATCH").length,
  items,
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (report.mismatched) process.exitCode = 1;
