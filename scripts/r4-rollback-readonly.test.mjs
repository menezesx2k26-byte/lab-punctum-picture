import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRollbackPreflight, summarizeQaReadOnlyProbes, R4_ROLLBACK_QA } from "./lib/r4-rollback-readonly.mjs";

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
    { settings:{bindings:[{ name:"DB", type:"d1", id:R4_ROLLBACK_QA.databases[1].id },
      { name:"PRIVATE_GALLERIES_ENABLED",type:"plain_text",text:"false" }] } },
    { settings:{bindings:[{ name:"DB", type:"d1", id:R4_ROLLBACK_QA.databases[0].id },
      { name:"PRIVATE_GALLERIES_ENABLED",type:"plain_text",text:"true" }] } },
  ]) {
    const result = summarizeRollbackPreflight({...fixture(),...patch});
    assert.equal(result.inventoryVerified, false);
    assert.equal(result.rollbackAuthorized, false);
  }
});
test("failed subscription and D1 probes disclose only actionable scope diagnostics, not secrets", () => {
  const result = summarizeQaReadOnlyProbes({
    subscriptions:{http:403,success:false}, scripts:{http:200,success:true},
    databases:{http:401,success:false}, buckets:{http:200,success:true},
    settings:{http:200,success:true}, deployments:{http:200,success:true},
  });
  assert.equal(result.complete,false);
  assert.equal(result.status,"BLOCKED_READ_ONLY_SCOPES_UNVERIFIED");
  assert.deepEqual(result.incomplete,["subscriptions","databases"]);
  assert.equal(result.diagnostics.subscriptions,"HTTP_403_SCOPE_OR_ACCOUNT_ACCESS_REQUIRED");
  assert.equal(result.diagnostics.databases,"HTTP_401_AUTH_OR_RESOURCE_PERMISSION_UNVERIFIED");
  assert.ok(!JSON.stringify(result).includes("token"));
});
test("sanitized report contains no binding secrets or raw credentials", () => {
  const input = fixture();
  input.settings.bindings.push({ name:"CLIENT_SESSION_SECRET",type:"secret_text",text:"must-not-appear" });
  const result = summarizeRollbackPreflight(input);
  assert.ok(!JSON.stringify(result).includes("must-not-appear"));
  assert.ok(!JSON.stringify(result).includes("CLIENT_SESSION_SECRET"));
});
