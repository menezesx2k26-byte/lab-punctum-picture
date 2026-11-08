import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRollbackPreflight, R4_ROLLBACK_QA } from "./lib/r4-rollback-readonly.mjs";

const fixture = () => ({
  subscriptions: [{ rate_plan: { id: "free" } }],
  scripts: [{ id: R4_ROLLBACK_QA.worker }],
  databases: R4_ROLLBACK_QA.databases.map(({ name, id }) => ({ name, uuid: id })),
  buckets: { buckets: R4_ROLLBACK_QA.buckets.map((name) => ({name})) },
  settings: { bindings: [
    { name:"DB", type:"d1", id:R4_ROLLBACK_QA.databases[0].id },
    { name:"PRIVATE_GALLERIES_ENABLED", type:"plain_text", text:"false" },
  ] },
  deployments: { deployments:[{ id:"deployment-1",versions:[{version_id:"previous-version-id"}] }] },
});
test("read-only QA inventory is scoped but never authorizes a G23 rollback", () => {
  const result = summarizeRollbackPreflight(fixture());
  assert.equal(result.inventoryVerified, true);
  assert.equal(result.rollbackAuthorized, false);
  assert.equal(result.productionSafeToRelease, false);
  assert.equal(result.accountPlan, "free");
  assert.deepEqual(result.versionIds, ["previous-version-id"]);
  assert.equal(result.flag, "false");
  assert.ok(result.blockers.some(s => s.includes("D1/R2")));
});
test("missing or ambiguous resource readback fails closed, not PASS", () => {
  for (const patch of [
    { databases: [] }, { scripts:[] }, { buckets:{buckets:[]} },
    { subscriptions:[{ rate_plan:{ id:"workers_paid" } }] },
    { settings:null }, { deployments:null },
  ]) {
    const result = summarizeRollbackPreflight({...fixture(),...patch});
    assert.equal(result.inventoryVerified, false);
    assert.equal(result.rollbackAuthorized, false);
  }
});
test("sanitized report contains no binding secrets or raw credentials", () => {
  const input = fixture();
  input.settings.bindings.push({ name:"CLIENT_SESSION_SECRET",type:"secret_text",text:"must-not-appear" });
  const result = summarizeRollbackPreflight(input);
  assert.ok(!JSON.stringify(result).includes("must-not-appear"));
  assert.ok(!JSON.stringify(result).includes("CLIENT_SESSION_SECRET"));
});
