/** R5 fixture-only read-only structural checker. NOT product/HTTP/D1/Images tests.
 * Usage: node docs/operations/private-albums-r5-guided/verify-r5-synthetic-fixture.mjs
 * No files are changed; output JSON and exit code 1 on failed invariant.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "r5-red-synthetic-fixture.json"), "utf8"));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function verify(f) {
  const p=f.proofsA, r=f.review.items, c=f.cases;
  const predicates = {
    proofCount30: p.length===30,
    uniqueProofs: new Set(p.map(x=>x.proofImageId)).size===30,
    uuidV4Shape: p.every(x=>uuid.test(x.proofImageId)),
    finalVersions25: p.filter(x=>x.finalVersionId).length===25,
    pendingFinals5: p.filter(x=>!x.finalVersionId).length===5,
    reviewItems5: r.length===5,
    acceptedEdits4: r.filter(x=>x.decision==="accepted").length===4,
    rejectedEdits1: r.filter(x=>x.decision==="rejected").length===1,
    reviewRefsOwnedProofs: r.every(x=>p.some(y=>y.proofImageId===x.proofImageId)),
    distinctTenants: f.galleries.A.clientId!==f.galleries.B.clientId,
    cases26: c.length===26,
    uniqueCaseIds: new Set(c.map(x=>x.id)).size===c.length,
    casesNotRun: c.every(x=>x.execution==="NOT_RUN"),
    noActualWatermark: p.every(x=>x.watermarkBytesAvailable===false),
    noR2StorageKey: p.every(x=>!Object.hasOwn(x,"storageKey")),
    emailPostCommit: c.find(x=>x.id==="RED-NOTIFY-01")?.expectedStatus===200,
    rejectedCandidateDenied: c.find(x=>x.id==="RED-DELIVERY-04")?.expectedStatus===404,
  };
  return Object.entries(predicates).map(([id,passed])=>({id,passed}));
}
const positive=verify(fixture);
const changed=JSON.parse(JSON.stringify(fixture));
changed.review.items[4].decision="accepted"; // In-memory mutation only.
const negative=verify(changed);
const changedIds=negative.filter(x=>!x.passed).map(x=>x.id);
const result={
  kind:"SYNTHETIC_FIXTURE_STRUCTURE_ONLY",
  warning:"No product code, endpoint, database, image, physical UI, build, or tests of business behavior were executed.",
  assertions:positive.length,
  passed:positive.filter(x=>x.passed).length,
  failed:positive.filter(x=>!x.passed).map(x=>x.id),
  negativeControl:{
    mutation:"Fifth rejected edit changed to accepted in memory only",
    detected:changedIds.includes("acceptedEdits4")&&changedIds.includes("rejectedEdits1"),
    changedIds,
  },
  fixtureCasesPrepared:fixture.cases.length,
  fixtureCasesExecuted:0,
  checks:positive,
};
console.log(JSON.stringify(result,null,2));
if(result.failed.length || !result.negativeControl.detected) process.exitCode=1;
