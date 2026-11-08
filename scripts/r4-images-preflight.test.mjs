import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeImageUsage, summarizeSubscriptions, decideImageQaReadiness, isCloudflareProbeSuccess } from "./lib/r4-images-preflight.mjs";

test("subscription inventory cannot imply free Images from missing or partial data", () => {
  assert.equal(summarizeSubscriptions(null).plan, "UNVERIFIED");
  assert.equal(summarizeSubscriptions([{id:"free"},{id:"r2_paid"}]).plan, "FREE_CANDIDATE");
  assert.equal(summarizeSubscriptions([{id:"free"},{id:"images_paid"}]).plan, "PAID_OR_LEGACY");
  assert.equal(summarizeSubscriptions([{id:"free"},{id:"workers_paid"}]).plan, "UNVERIFIED");
  assert.equal(summarizeSubscriptions([{id:"free"},{id:"images",price:5}]).plan, "PAID_OR_LEGACY");
  assert.equal(summarizeSubscriptions([{id:"free"},{id:"legacy_image_resizing"}]).plan, "PAID_OR_LEGACY");
  assert.equal(summarizeSubscriptions([{id:"workers_paid"}]).plan, "UNVERIFIED");
});
test("transformations require a fresh cumulative daily count, never infer zero from missing data", () => {
  assert.equal(summarizeImageUsage(null,"2026-11-07").current, null);
  assert.equal(summarizeImageUsage([],"2026-11-07").current, null);
  assert.equal(summarizeImageUsage([{date:"2026-10-31",transformations:0}],"2026-11-07").current,null);
  assert.equal(summarizeImageUsage([{date:"2026-11-03",transformations:4921},{date:"2026-11-07",transformations:4930}],"2026-11-07").current,4930);
  assert.equal(summarizeImageUsage([{date:"2026-11-07",transformations:-2}],"2026-11-07").current,null);
});
test("Images QA decision stays fail-closed with unknown plan, source or headroom", () => {
  const good = {plan:"FREE_CANDIDATE",transformations:20,workerPlan:"free",source:"graphql"};
  assert.equal(decideImageQaReadiness(good).mayAttemptSyntheticQa,true);
  for (const invalid of [
    {...good,plan:"UNVERIFIED"}, {...good,plan:"PAID_OR_LEGACY"},
    {...good,transformations:null}, {...good,transformations:4998},
    {...good,workerPlan:"paid"}, {...good,source:"stats-storage"},
  ]) assert.equal(decideImageQaReadiness(invalid).mayAttemptSyntheticQa,false);
});
test("Cloudflare GraphQL success is data without REST success=true; GraphQL errors are blocking", () => {
  assert.equal(isCloudflareProbeSuccess("/graphql",true,{data:{viewer:{accounts:[]}}}),true);
  assert.equal(isCloudflareProbeSuccess("/graphql",true,{data:{viewer:{accounts:[]}},errors:[{message:"no"}]}),false);
  assert.equal(isCloudflareProbeSuccess("/graphql",true,{data:null}),false);
  assert.equal(isCloudflareProbeSuccess("/accounts/x/subscriptions",true,{success:true,result:[]}),true);
  assert.equal(isCloudflareProbeSuccess("/accounts/x/subscriptions",true,{data:{viewer:{}}}),false);
});