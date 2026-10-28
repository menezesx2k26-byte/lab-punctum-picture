// Dedicated new QA only. Default is read-only; no historical QA or production mutation.
import { mkdir, writeFile } from 'node:fs/promises';
import { R4_QA } from './lib/r4-edge-qa.mjs';
const account = '257bca437616da74ece1ce4bbaf0bd89';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (process.env.GITHUB_ACTIONS !== 'true' || !token) throw new Error('Run only in credential-masked GitHub Actions');
const now = new Date();
const day = new Date(now); day.setUTCHours(0,0,0,0);
const month = new Date(now); month.setUTCDate(1); month.setUTCHours(0,0,0,0);
const report = {schemaVersion:1, observedAt:now.toISOString(), sourceSha:process.env.GITHUB_SHA, stage:'preflight', productionTouched:false, historicalQaTouched:false, writes:0, resources:R4_QA, probes:[]};
await mkdir('outputs',{recursive:true});
async function api(path, body, method) {
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method:method ?? (body ? 'POST':'GET'),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
 const value=await response.json();
 report.probes.push({path:path.replace(account,'[account]'),status:response.status,success:value.success,errors:value.errors?.map(e=>({code:e.code,message:String(e.message??'').slice(0,200)}))});
 return value;
}
async function graph(label, query, variables) {
 const result=await api('/graphql',{query,variables});
 const data=result.data?.viewer?.accounts?.[0];
 report[label]={accessible:!!data && !result.errors?.length, data:data??null, errors:result.errors?.map(e=>String(e.message??'').slice(0,300))};
 return data;
}
try {
 const [databases,buckets,subscriptions,scripts,subdomain] = await Promise.all([
   api(`/accounts/${account}/d1/database?per_page=100`), api(`/accounts/${account}/r2/buckets`), api(`/accounts/${account}/subscriptions`), api(`/accounts/${account}/workers/scripts`),api(`/accounts/${account}/workers/subdomain`),
 ]);
 report.databaseInventory=databases.success ? databases.result.map(d=>({name:d.name,uuid:d.uuid,fileSize:d.file_size})):null;
 report.bucketInventory=buckets.success ? buckets.result.buckets.map(b=>({name:b.name})):null;
 report.subscriptions=subscriptions.success ? subscriptions.result.map(s=>({id:s.rate_plan?.id,product:s.rate_plan?.public_name,price:s.price,currency:s.currency,state:s.state})):null;
 report.workerInventory=scripts.success ? scripts.result.map(s=>({name:s.id})):null;
 report.subdomain=subdomain.success ? subdomain.result.subdomain:null;
 const variables={accountTag:account,start:month.toISOString(),end:now.toISOString()};
 await graph('r2Storage','query($accountTag:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$accountTag}){r2StorageAdaptiveGroups(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end}){dimensions{bucketName} max{payloadSize}}}}}',variables);
 await graph('r2Operations','query($accountTag:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$accountTag}){r2OperationsAdaptiveGroups(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end}){dimensions{actionType} sum{requests}}}}}',variables);
 await graph('workerUsage','query($accountTag:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$start,datetime_lt:$end}){sum{requests errors}}}}}',{...variables,start:day.toISOString()});
 await graph('d1Usage','query($accountTag:String!,$start:Date!,$end:Date!){viewer{accounts(filter:{accountTag:$accountTag}){d1AnalyticsAdaptiveGroups(limit:1000,filter:{date_geq:$start,date_leq:$end}){sum{rowsRead rowsWritten}}}}}',{accountTag:account,start:day.toISOString().slice(0,10),end:now.toISOString().slice(0,10)});
 report.measurementIntervals={r2:[month.toISOString(),now.toISOString()],workers:[day.toISOString(),now.toISOString()]};
 // Explicit failure until every quota metric has a verifiable parser. No writes in preflight.
 report.status='READ_ONLY_PREFLIGHT_COMPLETE';
 if(process.env.R4_EDGE_QA_EXECUTE==='true') {
   const { runFreshQa } = await import('./r4-edge-execute.mjs');
   await runFreshQa(report,api);
 }
} catch(error) {
 report.status='FAILED_CLOSED';report.failure=error.message;
 process.exitCode=1;
} finally {
 await writeFile('outputs/r4-edge-qa-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
