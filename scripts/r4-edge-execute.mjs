// Never imported by production. One bounded, fresh-resource QA execution.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { R4_QA, R4_RESUME_DATABASES, assertFreshQaBudget, assertResumeQaInventory, isolatedQaConfig, summarizeQaSamples } from './lib/r4-edge-qa.mjs';
const ACCOUNT = '257bca437616da74ece1ce4bbaf0bd89';
const pause = ms => new Promise(r=>setTimeout(r,ms));
const sum = (rows, field) => rows.reduce((n,row)=>n+Number(row.sum?.[field]??0),0);
export async function runFreshQa(report, api) {
 const databaseList=report.databaseInventory, bucketList=report.bucketInventory, workerList=report.workerInventory;
 const resume=process.env.R4_EDGE_QA_RESUME==='true';
 assert.ok(databaseList && bucketList && workerList && report.subdomain, 'Verified complete inventory required');
 assert.equal(report.r2Storage?.accessible,true,'Measured R2 storage required');
 assert.equal(report.r2Operations?.accessible,true,'Measured R2 operations required');
 assert.equal(report.workerUsage?.accessible,true,'Measured Workers usage required');
 const storageRows=report.r2Storage.data.r2StorageAdaptiveGroups;
 const operationsRows=report.r2Operations.data.r2OperationsAdaptiveGroups;
 const workerRows=report.workerUsage.data.workersInvocationsAdaptive;
 for(const rows of [storageRows,operationsRows,workerRows]) assert.ok(Array.isArray(rows) && rows.length<1000, 'Complete bounded usage evidence required');
 // Count EVERY R2 operation as both A and B: conservative upper bounds avoid unrecognized-action undercounts.
 const allOperations=sum(operationsRows,'requests');
 const budget={databaseCount:databaseList.length,workerRequestsToday:sum(workerRows,'requests'),r2:{maximumStorageBytes:storageRows.reduce((n,row)=>n+Number(row.max?.payloadSize??0),0),classARequests:allOperations,classBRequests:allOperations},subscriptions:report.subscriptions,namesInUse:[...databaseList,...bucketList,...workerList].map(x=>x.name)};
 if(resume) {
   assertResumeQaInventory({databases:databaseList,buckets:bucketList,workers:workerList});
   // This receipt is verified before excluding adopted names/slots from NEW allocation checks.
   assertFreshQaBudget({...budget,databaseCount:databaseList.length-2,namesInUse:budget.namesInUse.filter(name=>!Object.values(R4_QA).includes(name))});
   assert.equal(report.d1Usage?.accessible,true,'Current D1 usage required before resuming');
   const rows=report.d1Usage.data.d1AnalyticsAdaptiveGroups;
   assert.ok(Array.isArray(rows) && rows.length<1000 && rows.every(r=>['rowsRead','rowsWritten'].every(k=>Number.isSafeInteger(r.sum?.[k]) && r.sum[k]>=0)),'Complete D1 metrics required');
   report.d1Budget={rowsRead:sum(rows,'rowsRead'),rowsWritten:sum(rows,'rowsWritten')};
   assert.ok(report.d1Budget.rowsRead<4_500_000 && report.d1Budget.rowsWritten<90_000,'D1 free headroom required');
 } else assertFreshQaBudget(budget);
 report.budget=budget;report.budget.operationClassification='Every observed operation counted against both free limits; upper bound';
 const origin=`https://${R4_QA.worker}.${report.subdomain}.workers.dev`;
 report.executionRunId=process.env.GITHUB_RUN_ID;report.origin=origin;report.created={databases:[],buckets:[]};report.checks=[];
 const base='/accounts/'+ACCOUNT;
 const requireApi=async(path,body,method)=>{
   const value=await api(path,body,method);
   assert.equal(value.success,true,'Cloudflare operation rejected: '+path.replace(ACCOUNT,'[account]'));
   return value.result;
 };
 const checkpoint=()=>writeFile('outputs/r4-edge-qa-report.json',JSON.stringify(report,null,2));
 const mutate=async(path,body,method)=>{const result=await requireApi(path,body,method);report.writes++;return result;};
 for(const name of resume ? [] : [R4_QA.source,R4_QA.restore]) {
   const result=await mutate(base+'/d1/database',{name});
   assert.equal(result.name,name);assert.match(result.uuid,/^[a-f0-9-]{36}$/i);
   report.created.databases.push({name,id:result.uuid});await checkpoint();
 }
 if(resume) { report.created.databases=R4_RESUME_DATABASES.map(d=>({...d}));report.created.buckets=[R4_QA.originals,R4_QA.restored,R4_QA.backups];report.adoptedFromRun='40756797747';await checkpoint(); }
 for(const name of resume ? [] : [R4_QA.originals,R4_QA.restored,R4_QA.backups]) {
   await mutate(base+'/r2/buckets',{name});report.created.buckets.push(name);await checkpoint();
   const managed=await requireApi(base+'/r2/buckets/'+name+'/domains/managed');
   const custom=await requireApi(base+'/r2/buckets/'+name+'/domains/custom');
   assert.equal(managed.enabled,false,'New R2 bucket must be private');
   assert.ok(Array.isArray(custom.domains) && custom.domains.every(d=>d.enabled===false),'Custom R2 domains must be disabled');
 }
 const sourceId=report.created.databases[0].id;
 const createdDatabaseIds=report.created.databases.map(d=>d.id);
 const query=async(id,sql,params=[])=>{
   assert.ok(createdDatabaseIds.includes(id),'Only databases allocated during this run may be queried');
   const result=await requireApi(base+'/d1/database/'+id+'/query',{sql,params});
   assert.ok(Array.isArray(result) && result.every(r=>r.success===true),'D1 query failed');
   return result.flatMap(r=>r.results);
 };
 for(const id of createdDatabaseIds) {
   const rows=await query(id,resume ? 'SELECT COUNT(*) AS count FROM client_accounts' : "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'");
   assert.equal(rows[0].count,0,resume ? 'Interrupted QA contains accounts; preserve data and stop' : 'New database unexpectedly contains application tables');
 }
 const roots={baseline:resolve('.qa-baseline'),candidate:process.cwd()};
 const configs={};
 for(const [label,root] of Object.entries(roots)) {
   const built=JSON.parse(await readFile(resolve(root,'dist/server/wrangler.json'),'utf8'));
   const config=isolatedQaConfig(built,{databaseId:sourceId,createdDatabaseIds,origin,performanceOnly:true});
   config.version_metadata={binding:'QA_VERSION'};
   config.main='r4-version-wrapper.mjs';
   await writeFile(resolve(root,'dist/server/r4-version-wrapper.mjs'),`import worker from './index.js';\nexport default { async fetch(request,env,ctx) { const response=await worker.fetch(request,env,ctx); const headers=new Headers(response.headers); headers.set('X-QA-Version',env.QA_VERSION.id); return new Response(response.body,{status:response.status,statusText:response.statusText,headers}); } };\n`);
   const path=resolve(root,'dist/server/r4-qa.wrangler.json');
   await writeFile(path,JSON.stringify(config));configs[label]={root,path,config};
 }
 const wrangler=(args,input)=>{
   const result=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args],{encoding:'utf8',input,maxBuffer:8*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
   if(result.status!==0) throw new Error('Wrangler '+args[0]+' '+args[1]+' failed with exit '+result.status+'; inspect sanitized platform state');
   return result.stdout;
 };
 // Baseline migration track is fixed. Both application builds read the same fresh DB.
 for(const database of resume ? [] : report.created.databases) {
   const config={...configs.baseline.config,d1_databases:[{binding:'DB',database_name:database.name,database_id:database.id,migrations_dir:'../../migrations'}]};
   const path=resolve(roots.baseline,'dist/server/r4-migration.wrangler.json');await writeFile(path,JSON.stringify(config));
   wrangler(['d1','migrations','apply',database.name,'--remote','--config',path]);report.writes++;
 }
 report.checks.push(resume ? 'Adopted only exact interrupted QA IDs, confirmed zero client accounts, no migrations or resource creation' : 'Two new empty D1 databases migrated; historical IDs never queried or migrated');
 let previousVersionId;
 const deploy=async(label)=>{
   wrangler(['deploy','--config',configs[label].path]);report.writes++;
   let latest;
   for(let attempt=0;attempt<30;attempt++){
     const deployments=await requireApi(base+'/workers/scripts/'+R4_QA.worker+'/deployments');
     latest=deployments.deployments?.[0];
     if(latest?.versions?.length===1 && latest.versions[0].version_id!==previousVersionId)break;
     await pause(1000);
   }
   assert.ok(latest?.versions?.length===1 && latest.versions[0].version_id!==previousVersionId,'New single-version QA deployment required');
   const version={deploymentId:latest.id,versionId:latest.versions[0].version_id,createdOn:latest.created_on};
   let ready=false;
   for(let attempt=0;attempt<30;attempt++){
     const response=await fetch(origin+'/robots.txt',{signal:AbortSignal.timeout(15000)});
     await response.text();
     if(response.headers.get('X-QA-Version')===version.versionId){ready=true;break;}
     await pause(1000);
   }
   assert.ok(ready,'Deployment version propagation not verified');
   previousVersionId=version.versionId;
   return version;
 };
 const summary=values=>{
   if(!values.length)return null;const a=[...values].sort((a,b)=>a-b);const p=n=>a[Math.ceil(a.length*n)-1];
   return {samples:a.length,p50:p(.5),p95:p(.95),p99:p(.99),minimum:a[0],maximum:a.at(-1)};
 };
 const measure=async(label,version)=>{
   const startedAt=new Date().toISOString(),samples=[];
   for(let i=0;i<64;i++) {
     const start=performance.now();
     try {
       const response=await fetch(origin+'/',{headers:{Accept:'text/html'},redirect:'manual',signal:AbortSignal.timeout(15000)});
       const bytes=new Uint8Array(await response.arrayBuffer());
       samples.push({index:i,status:response.status,actualVersionId:response.headers.get('X-QA-Version'),latencyMs:performance.now()-start,bytes:bytes.length});
     }catch{samples.push({index:i,status:'NETWORK_ERROR',latencyMs:performance.now()-start});}
   }
   const completedAt=new Date().toISOString();
   const result={label,...version,sourceSha:label==='baseline'?'b417405c0406daf286b192a8151cf45c4a50f89c':process.env.GITHUB_SHA,startedAt,completedAt,samples,latencyMs:summary(samples.map(s=>s.latencyMs)),...summarizeQaSamples(samples,version.versionId)};
   report.performance??=[];report.performance.push(result);await checkpoint();
   assert.equal(result.versionMismatches,0,'Mixed application versions invalidate performance comparison');
   // Allow analytics ingestion; this is bounded and doesn't warm either application version.
   await pause(15000);
   const query='query($accountTag:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:1000,filter:{scriptName:"'+R4_QA.worker+'",datetime_geq:$start,datetime_lt:$end}){sum{requests errors} quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99 wallTimeP50 wallTimeP95 wallTimeP99}}}}}';
   const metrics=await api('/graphql',{query,variables:{accountTag:ACCOUNT,start:startedAt,end:completedAt}});
   result.edgeMetrics=metrics.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive??null;
   const logs=await api(base+'/workers/observability/telemetry/query',{queryId:'r4-fresh-qa-'+label,dry:true,timeframe:{from:Date.parse(startedAt),to:Date.parse(completedAt)},view:'events',limit:1000,parameters:{datasets:[],filters:[{key:'$metadata.service',operation:'eq',type:'string',value:R4_QA.worker}]}});
   const events=logs.result?.events?.events??[];
   const records=events.filter(e=>e.$workers?.scriptVersion?.id===version.versionId && Number.isFinite(e.$workers?.cpuTimeMs)).map(e=>({cpuTimeMs:e.$workers.cpuTimeMs,wallTimeMs:e.$workers.wallTimeMs,timestamp:e.timestamp,versionId:e.$workers.scriptVersion.id}));
   result.telemetry={returnedEvents:events.length,versionFilteredSamples:records.length,cpuMs:summary(records.map(e=>e.cpuTimeMs)),wallMs:summary(records.map(e=>e.wallTimeMs)),records};
 };
 report.stage='baseline-performance';
 await measure('baseline',await deploy('baseline'));
 report.stage='candidate-performance';
 await measure('candidate',await deploy('candidate'));
 // Exercise rollback on this isolated Worker only, then restore the candidate.
 const rollback=await deploy('baseline');
 const rollbackResponse=await fetch(origin+'/',{signal:AbortSignal.timeout(15000)});const rollbackHtml=await rollbackResponse.text();
 assert.equal(rollbackResponse.status,200,'Isolated baseline rollback home must render');
 assert.equal(rollbackResponse.headers.get('X-QA-Version'),rollback.versionId,'Rollback response version must match');
 assert.match(rollbackHtml,/<\/html>/,'Rollback must produce complete HTML');
 report.rollback={...rollback,status:rollbackResponse.status,restoredCandidate:await deploy('candidate')};
 report.checks.push('Real edge baseline/candidate requests measured and isolated rollback verified');
 report.status=report.performance.every(p=>p.errors===0 && p.versionMismatches===0)?'PERFORMANCE_QA_EXECUTED':'PERFORMANCE_QA_WITH_REQUEST_FAILURES';report.stage='performance-complete';
 report.publicHomeGate={gate:'G17',status:report.status==='PERFORMANCE_QA_WITH_REQUEST_FAILURES'?'FAIL_HTTP_503':'MEASURED_NOT_RELEASE_APPROVED',
   baselineFailedRequests:report.performance[0].errors,candidateFailedRequests:report.performance[1].errors,
   versionMismatches:report.performance.reduce((sum,p)=>sum+p.versionMismatches,0)};
 report.functionalQa='NOT_RUN';report.accessOtp='NOT_RUN';
 if(process.env.R4_EDGE_QA_RECOVERY==='true') {
   assert.equal(resume,true,'Functional recovery is only permitted on exact interrupted QA resources');
   // G17/SSR stays failed. The private D1/R2 recovery gate is independently guarded.
   const { runR4RecoveryQa } = await import('./r4-recovery-execute.mjs');
   await runR4RecoveryQa(report,api);
 }
}
