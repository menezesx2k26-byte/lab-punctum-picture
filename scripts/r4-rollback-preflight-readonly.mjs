// Read-only G23 eligibility report for existing, dedicated R4 QA resources.
// This process does not run a rollback, deploy, mutate D1/R2 or read photo bodies.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { R4_ROLLBACK_QA, summarizeRollbackPreflight, summarizeQaReadOnlyProbes } from "./lib/r4-rollback-readonly.mjs";

assert.equal(process.env.GITHUB_ACTIONS, "true", "GitHub Actions only");
const token = process.env.CLOUDFLARE_API_TOKEN;
const reportFile = "outputs/r4-rollback-readonly.json";
const report = {
  schemaVersion: 1,
  sourceSha: process.env.GITHUB_SHA ?? null,
  runId: process.env.GITHUB_RUN_ID ?? null,
  checkedAt: new Date().toISOString(),
  account: R4_ROLLBACK_QA.account,
  scope: "EXISTING_R4_QA_READ_ONLY",
  operations: { get: 0, post: 0, put: 0, patch: 0, delete: 0, d1Queries: 0, r2Reads: 0 },
  productionTouched: false,
  historicalFixturesModified: false,
  flagModified: false,
  rollbackExecuted: false,
  status: "BLOCKED_NO_CREDENTIALS",
};
await mkdir("outputs", { recursive: true });
async function readApi(path) {
  report.operations.get++;
  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" +
      R4_ROLLBACK_QA.account + path, {
      headers: { Authorization: "Bearer " + token },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const value = await response.json().catch(() => ({}));
    // No raw API response, account tokens, Access policies or secret bindings
    // may enter the emitted report.
    return { ok: response.ok && value.success === true, value: value.result ?? null,
      http: response.status };
  } catch {
    return { ok: false, value: null, http: "NETWORK_ERROR" };
  }
}
if (token) {
  const [subscriptions, scripts, databases, buckets, settings, deployments] = await Promise.all([
    readApi("/subscriptions"),
    readApi("/workers/scripts"),
    readApi("/d1/database?per_page=100"),
    readApi("/r2/buckets"),
    readApi("/workers/scripts/" + R4_ROLLBACK_QA.worker + "/settings"),
    readApi("/workers/scripts/" + R4_ROLLBACK_QA.worker + "/deployments"),
  ]);
  report.probes = Object.fromEntries(Object.entries({
    subscriptions, scripts, databases, buckets, settings, deployments,
  }).map(([name, response]) => [name, { http: response.http, success: response.ok }]));
  report.accessAssessment = summarizeQaReadOnlyProbes(report.probes);
  if ([subscriptions, scripts, databases, buckets, settings, deployments]
    .every(result => result.ok)) {
    Object.assign(report, summarizeRollbackPreflight({
      subscriptions: subscriptions.value,
      scripts: scripts.value,
      databases: databases.value,
      buckets: buckets.value,
      settings: settings.value,
      deployments: deployments.value,
    }));
    // Inventory alone is never authorization to mutate the existing QA
    // worker, seed another customer, restore a D1 database or enable galleries.
    report.status = report.inventoryVerified ? "READ_ONLY_ELIGIBILITY_VERIFIED_ROLLBACK_BLOCKED"
      : "READ_ONLY_INVENTORY_UNVERIFIED";
  } else {
    report.status = report.accessAssessment.status;
  }
}
report.productionSafeToRelease = false;
report.rollbackExecuted = false;
report.writes = 0;
await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
