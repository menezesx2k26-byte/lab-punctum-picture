// Observation-only QA telemetry. No Worker deployment, D1 queries, R2 reads,
// binding changes, GraphQL mutations, or private payloads.
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {R4_CPU_HISTORICAL,summarizeHistoricalCpuMetrics} from "./lib/r4-cpu-historical-readonly.mjs";

assert.equal(process.env.GITHUB_ACTIONS,"true","Actions only");
assert.equal(process.env.GITHUB_REF,"refs/heads/fix/punctum-albums-r4-completion-20261107","QA branch only");
const report={schemaVersion:1,generatedAt:new Date().toISOString(),headSha:process.env.GITHUB_SHA??null,
  account:R4_CPU_HISTORICAL.account,worker:R4_CPU_HISTORICAL.worker,
  measuredSourceCodeSha:null,sourceCodeShaVerified:false,
  productionTouched:false,productionSafeToRelease:false,remoteWrites:0,
  d1Queries:0,r2Reads:0,deployments:0,
  cpuGatePassed:false,status:"BLOCKED_NO_CREDENTIALS"};
const now=new Date();const since=new Date(now.getTime()-24*60*60*1000);
report.windowUtc=[since.toISOString(),now.toISOString()];
const token=process.env.CLOUDFLARE_API_TOKEN;
if(token) {
  // Account and script name are fixed in source; no untrusted query fields.
  const query=`query($accountTag:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:1000,filter:{scriptName:"${R4_CPU_HISTORICAL.worker}",datetime_geq:$start,datetime_lt:$end}){sum{requests errors} quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99}}}}}`;
  try {
    const response=await fetch("https://api.cloudflare.com/client/v4/graphql",{
      method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({query,variables:{accountTag:R4_CPU_HISTORICAL.account,
        start:since.toISOString(),end:now.toISOString()}}),
      redirect:"error",signal:AbortSignal.timeout(15000),
    });
    report.http=response.status;
    // Never print GraphQL errors or arbitrary provider responses. Only the
    // approved numerical fields leave memory in this sanitized artifact.
    const payload=await response.json().catch(()=>null);
    const groups=payload?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
    if(!response.ok || !Array.isArray(groups))
      report.status=response.status===401||response.status===403
        ?"BLOCKED_GRAPHQL_READ_PERMISSION":"BLOCKED_GRAPHQL_TELEMETRY_UNAVAILABLE";
    else Object.assign(report,summarizeHistoricalCpuMetrics(groups));
  }catch{
    report.status="BLOCKED_GRAPHQL_NETWORK_ERROR";
  }
}
report.cpuGatePassed=false;
report.sourceCodeShaVerified=false;
report.remoteWrites=0;
await mkdir("outputs",{recursive:true});
await writeFile("outputs/r4-cpu-historical-readonly.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
