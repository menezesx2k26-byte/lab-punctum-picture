// Public-home CPU measurement on a one-run ephemeral Worker. Never reuse or modify
// historical QA Worker, production domains, migrations, or private gallery records.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {cpuQaEligibility,cpuQaFixtureEligibility,cpuQaWorkerConfig,summarizePublicCacheProbe,
  correlateColdCpuSamples,summarizeFirstRequestCpu,cpuTelemetryRecords,delayUntilNextCpuSample} from './lib/r4-cpu-readonly.mjs';

const ACCOUNT='257bca437616da74ece1ce4bbaf0bd89';
const SOURCE_ID='2e7710f3-dc92-4aeb-976a-5f15d8c5262c';
assert.equal(process.env.GITHUB_ACTIONS,'true','Actions only');
assert.equal(process.env.R4_CPU_READONLY_QA,'true','Explicit synthetic CPU QA opt-in');
const runId=process.env.GITHUB_RUN_ID;
assert.match(runId??'',/^[0-9]{5,15}$/,'Expected unique GitHub run ID');
const token=process.env.CLOUDFLARE_API_TOKEN;
assert.ok(token,'Account-scoped token missing');
const name='punctum-r4-cpu-probe-'+runId;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitForNextSecond=async()=>{
  await pause(delayUntilNextCpuSample(Date.now()));
};
const report={observedAt:new Date().toISOString(),sha:process.env.GITHUB_SHA,
  name,mode:'PUBLIC_READONLY_EPHEMERAL',productionTouched:false,
  historicalWorkerTouched:false,privateWrites:0,d1Writes:0,r2Writes:0,r2Reads:0,assetsModified:false,
  created:0,deleted:0,cleanupVerified:false,status:'PREFLIGHT'};
await mkdir('outputs',{recursive:true});
let oldCount=null,allocated=false;
const configPath=resolve('dist/server/r4-cpu-qa.wrangler.json');
async function api(path,options={}) {
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,{
    method:options.method??'GET',headers:{Authorization:'Bearer '+token,
      ...(options.body?{'Content-Type':'application/json'}:{})},
    ...(options.body?{body:JSON.stringify(options.body)}:{}),
    redirect:'error',signal:AbortSignal.timeout(20000)});
  const value=await response.json().catch(()=>({}));
  return {ok:response.ok&&value.success===true,result:value.result,
    status:response.status};
}
const wrangler=args=>{
  const result=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args],{
    timeout:120000,encoding:'utf8',maxBuffer:4*1024*1024,
    env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  return result.status===0;
};
const summary=values=>{
  const sorted=[...values].sort((a,b)=>a-b);
  const pick=q=>sorted[Math.max(0,Math.ceil(q*sorted.length)-1)];
  return sorted.length?{n:sorted.length,p50:pick(.5),p95:pick(.95),p99:pick(.99),max:sorted.at(-1)}:null;
};
const qCounts=async()=>{
  const sql=`SELECT (SELECT COUNT(*) FROM client_accounts) AS clients,
    (SELECT COUNT(*) FROM client_galleries) AS galleries,
    (SELECT COUNT(*) FROM client_gallery_images) AS images,
    (SELECT COUNT(*) FROM client_gallery_upload_intents) AS intents,
    (SELECT COUNT(*) FROM client_gallery_favorites) AS favorites,
    (SELECT COUNT(*) FROM site_config_pointers) AS pointers,
    (SELECT COUNT(*) FROM site_config_versions) AS configVersions,
    (SELECT COUNT(*) FROM site_config_pointers p JOIN site_config_versions v
      ON v.id=p.published_version_id AND v.state='published' WHERE p.id=1) AS validPublishedPointers`;
  const query=await api('/d1/database/'+SOURCE_ID+'/query',{method:'POST',body:{sql}});
  assert.ok(query.ok&&Array.isArray(query.result)&&query.result.length===1&&
    query.result[0]?.success===true,'Read-only D1 snapshot unavailable');
  const rows=query.result[0].results;
  assert.ok(Array.isArray(rows)&&rows.length===1,'D1 snapshot row missing');
  return rows[0];
};

try {
  const [subscriptions,workers,databases,subdomain]=await Promise.all([
    api('/subscriptions'),api('/workers/scripts'),api('/d1/database?per_page=100'),api('/workers/subdomain')]);
  for(const result of [subscriptions,workers,databases,subdomain])
    assert.ok(result.ok,'Account resource preflight incomplete');
  assert.ok(Array.isArray(workers.result)&&Array.isArray(databases.result)&&
    Array.isArray(subscriptions.result),'Complete inventory required');
  oldCount=workers.result.length;
  const eligibility=cpuQaEligibility({subscriptions:subscriptions.result.map(s=>({id:s.rate_plan?.id})),
    workers:workers.result,databases:databases.result,name});
  report.preflight={workerCount:oldCount,databaseCount:databases.result.length,
    planIds:subscriptions.result.map(s=>s.rate_plan?.id),workerPlan:eligibility.workerPlan,
    r2PaidSubscriptionPresent:eligibility.r2PaidSubscriptionPresent,
    incrementalCostVerified:eligibility.incrementalCostVerified,eligibility};
  assert.ok(eligibility.allowed,'Account free/DB/slot/name proof missing');
  assert.match(subdomain.result?.subdomain??'',/^[a-z0-9-]+$/);
  const origin='https://'+name+'.'+subdomain.result.subdomain+'.workers.dev';
  const before=await qCounts();
  assert.ok(cpuQaFixtureEligibility(before),
    'QA D1 must already have one valid published pointer; remote bootstrap writes are forbidden');
  report.privateCountsBefore=before;
  report.d1ReadOnlyBootstrapGuard={verified:true,pointers:before.pointers,
    configVersions:before.configVersions,validPublishedPointers:before.validPublishedPointers};
  report.snapshotMode={enabled:false,reason:'separate cache-MISS CPU probe; snapshot shortcut remains disabled'};
  const probeToken=randomBytes(32).toString('hex');
  console.log('::add-mask::'+probeToken);
  const config=cpuQaWorkerConfig(name,origin,probeToken);
  await copyFile(resolve('scripts/r4-cpu-guard.mjs'),resolve('dist/server/r4-cpu-guard.mjs'));
  await writeFile(resolve('dist/server/r4-cpu-entry.mjs'),
    "import app from './index.js';\nimport {cpuProbeFetch} from './r4-cpu-guard.mjs';\nexport {PublicHome} from './index.js';\nexport default {async fetch(req,env,ctx){const response=await cpuProbeFetch(req,env,ctx,app);const headers=new Headers(response.headers);headers.set('X-QA-Version',env.QA_VERSION.id);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}};\n");
  await writeFile(configPath,JSON.stringify(config));
  allocated=true;
  assert.ok(wrangler(['deploy','--config',configPath]),'Read-only Worker deploy failed');
  report.created=1;
  let deploymentRead=null;
  for(let attempt=0;attempt<30;attempt++){
    deploymentRead=await api('/workers/scripts/'+name+'/deployments');
    const latest=deploymentRead.result?.deployments?.[0];
    if(deploymentRead.ok&&latest?.versions?.length===1&&
      typeof latest.versions[0]?.version_id==='string')break;
    await pause(1000);
  }
  const latestDeployment=deploymentRead?.result?.deployments?.[0];
  assert.ok(deploymentRead?.ok&&latestDeployment?.versions?.length===1&&
    typeof latestDeployment.versions[0]?.version_id==='string',
    'Single deployed version ID unavailable for CPU telemetry correlation');
  const version={deploymentId:latestDeployment.id,versionId:latestDeployment.versions[0].version_id,
    createdOn:latestDeployment.created_on};
  report.version=version;
  const scriptSettings=await api('/workers/scripts/'+name+'/settings');
  assert.ok(scriptSettings.ok,'Cannot verify ephemeral Worker settings');
  const bindings=scriptSettings.result?.bindings??[];
  assert.ok(bindings.some(b=>b.name==='DB'&&b.type==='d1'),
    'Synthetic D1 binding absent');
  assert.ok(!bindings.some(b=>['ORIGINALS','BACKUPS','IMAGES'].includes(b.name)),
    'Unexpected media or image binding');
  await waitForNextSecond();
  const firstStartedAt=new Date().toISOString();
  const firstStarted=performance.now();
  const firstResponse=await fetch(origin+'/',{headers:{Accept:'text/html','X-R4-CPU-Probe':probeToken},
    redirect:'manual',signal:AbortSignal.timeout(20000)});
  const firstBody=await firstResponse.text();
  const firstFinishedAt=new Date().toISOString();
  const firstVersionMatches=firstResponse.headers.get('X-QA-Version')===version.versionId;
  const firstSample={index:0,startedAt:firstStartedAt,finishedAt:firstFinishedAt,status:firstResponse.status,
    versionId:version.versionId,rayId:firstResponse.headers.get('CF-Ray'),
    cacheStatus:firstResponse.headers.get('CF-Cache-Status'),latencyMs:Math.round(performance.now()-firstStarted),
    validHtml:firstBody.includes('</html>')&&firstVersionMatches,versionMatches:firstVersionMatches};
  report.firstRequest=firstSample;
  assert.ok(firstSample.status===200&&firstSample.validHtml&&['MISS','EXPIRED'].includes(firstSample.cacheStatus),
    'First authenticated request after deploy was not version-matched HTML on a cache MISS');
  // Keep the first invocation's telemetry window isolated from guard probes and warm requests.
  await pause(1200);
  const unauthenticated=await fetch(origin+'/',{redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert.equal(unauthenticated.status,404,'Unauthorized root must be closed');
  const forbiddenMethod=await fetch(origin+'/',{method:'POST',
    headers:{'X-R4-CPU-Probe':probeToken},redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert.equal(forbiddenMethod.status,404,'Mutating methods must be closed');
  const samples=[firstSample];
  for(let i=1;i<36;i++){
    const started=performance.now();
    const response=await fetch(origin+'/',{headers:{Accept:'text/html','X-R4-CPU-Probe':probeToken},redirect:'manual',
      signal:AbortSignal.timeout(20000)});
    const body=await response.text();
    const versionMatches=response.headers.get('X-QA-Version')===version.versionId;
    samples.push({status:response.status,cacheStatus:response.headers.get('CF-Cache-Status'),latencyMs:Math.round(performance.now()-started),
      validHtml:body.includes('</html>')&&versionMatches,versionMatches});
  }
  report.http={versionId:version.versionId,errorSamples:samples.filter(s=>s.status!==200||!s.validHtml).map(s=>({status:s.status,cacheStatus:s.cacheStatus,validHtml:s.validHtml,versionMatches:s.versionMatches})),cacheStatuses:samples.reduce((counts,sample)=>({...counts,[sample.cacheStatus??'none']:(counts[sample.cacheStatus??'none']??0)+1}),{}),total:samples.length,success:samples.filter(s=>s.status===200&&s.validHtml).length,
    errors:samples.filter(s=>s.status!==200||!s.validHtml).length,
    latencyMs:summary(samples.map(s=>s.latencyMs))};
  // Prove selective Workers Cache purge in this ephemeral entrypoint only.
  // The token never enters the report. No historical Worker/DB writes occur.
  const hasWarmCache=samples.length===36&&samples.every(s=>s.status===200&&s.validHtml)&&
    samples.filter(s=>s.cacheStatus==='HIT').length>=30;
  if(!hasWarmCache)throw Error('Warm cache was not verified; cannot test scoped purge');
  const purgeResponse=await fetch(origin+'/probe-purge',{method:'POST',
    headers:{'X-R4-CPU-Probe':probeToken},redirect:'manual',signal:AbortSignal.timeout(15000)});
  const purgeBody=await purgeResponse.json().catch(()=>null);
  report.cachePurge={scope:'ephemeral-PublicHome-only',status:purgeResponse.status,
    accepted:purgeResponse.status===200&&purgeBody?.ok===true};
  assert.ok(report.cachePurge.accepted,'Scoped PublicHome purge was not accepted');
  const afterPurge=await fetch(origin+'/',{headers:{Accept:'text/html',
    'X-R4-CPU-Probe':probeToken},redirect:'manual',signal:AbortSignal.timeout(20000)});
  const afterPurgeHtml=await afterPurge.text();
  report.cachePurge.afterPurge={status:afterPurge.status,
    cacheStatus:afterPurge.headers.get('CF-Cache-Status'),html:afterPurgeHtml.includes('</html>'),
    versionMatches:afterPurge.headers.get('X-QA-Version')===version.versionId};
  assert.ok(afterPurge.status===200&&report.cachePurge.afterPurge.html&&
    report.cachePurge.afterPurge.versionMatches&&
    ['MISS','EXPIRED'].includes(report.cachePurge.afterPurge.cacheStatus),
    'Fresh public HTML after purge was not observed');
  const rewarmed=await fetch(origin+'/',{headers:{Accept:'text/html',
    'X-R4-CPU-Probe':probeToken},redirect:'manual',signal:AbortSignal.timeout(15000)});
  const rewarmHtml=await rewarmed.text();
  report.cachePurge.rewarm={status:rewarmed.status,
    cacheStatus:rewarmed.headers.get('CF-Cache-Status'),html:rewarmHtml.includes('</html>'),
    versionMatches:rewarmed.headers.get('X-QA-Version')===version.versionId};
  assert.ok(rewarmed.status===200&&report.cachePurge.rewarm.html&&
    report.cachePurge.rewarm.versionMatches&&
    report.cachePurge.rewarm.cacheStatus==='HIT',
    'Public home was not cached again after scoped purge');
  report.cachePurge.verified=true;
  const coldSamples=[];
  for(let i=0;i<12;i++){
    const purge=await fetch(origin+'/probe-purge',{method:'POST',
      headers:{'X-R4-CPU-Probe':probeToken},redirect:'manual',signal:AbortSignal.timeout(15000)});
    const purgeBody=await purge.json().catch(()=>null);
    assert.ok(purge.status===200&&purgeBody?.ok===true,'Cold sample cache purge failed');
    await pause(1200);
    await waitForNextSecond();
    const startedAt=new Date().toISOString();
    const started=performance.now();
    const response=await fetch(origin+'/',{headers:{Accept:'text/html','X-R4-CPU-Probe':probeToken},
      redirect:'manual',signal:AbortSignal.timeout(20000)});
    const body=await response.text();
    const finishedAt=new Date().toISOString();
    const htmlValid=body.includes('</html>');
    const versionMatches=response.headers.get('X-QA-Version')===version.versionId;
    const sample={index:i+1,startedAt,finishedAt,status:response.status,
      versionId:version.versionId,rayId:response.headers.get('CF-Ray'),
      cacheStatus:response.headers.get('CF-Cache-Status'),latencyMs:Math.round(performance.now()-started),
      validHtml:htmlValid&&versionMatches,versionMatches};
    coldSamples.push(sample);
    assert.ok(sample.status===200&&sample.validHtml&&['MISS','EXPIRED'].includes(sample.cacheStatus),
      'Cold sample '+(i+1)+' did not return version-matched HTML on a cache MISS');
    await pause(1200);
  }
  report.coldMisses={count:coldSamples.length,cacheStatuses:coldSamples.reduce((counts,sample)=>
    ({...counts,[sample.cacheStatus??'none']:(counts[sample.cacheStatus??'none']??0)+1}),{}),samples:coldSamples};
  report.firstRequestWindow={start:new Date(Date.parse(firstSample.startedAt)-500).toISOString(),
    end:new Date(Date.parse(firstSample.finishedAt)+500).toISOString()};
  report.measurementWindow={start:new Date(Date.parse(coldSamples[0].startedAt)-500).toISOString(),
    end:new Date(Date.parse(coldSamples.at(-1).finishedAt)+500).toISOString()};
  await pause(15000);
  const query='query($accountTag:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:1000,filter:{scriptName:"'+name+'",datetime_geq:$start,datetime_lt:$end}){sum{requests errors} quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99}}}}}';
  const result=await fetch('https://api.cloudflare.com/client/v4/graphql',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({query,variables:{accountTag:ACCOUNT,start:report.measurementWindow.start,
      end:report.measurementWindow.end}}),signal:AbortSignal.timeout(20000)});
  const parsed=await result.json().catch(()=>({}));
  const groups=parsed.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  report.cpuAnalytics=Array.isArray(groups)?groups.map(x=>({
    samples:x.sum?.requests??null,errors:x.sum?.errors??null,cpuP50:x.quantiles?.cpuTimeP50??null,
    cpuP95:x.quantiles?.cpuTimeP95??null,cpuP99:x.quantiles?.cpuTimeP99??null})):null;
  const logs=await api('/workers/observability/telemetry/query',{method:'POST',body:{
    queryId:'r4-cpu-readonly-'+runId,dry:true,
    timeframe:{from:Date.parse(report.measurementWindow.start),to:Date.parse(report.measurementWindow.end)},
    view:'events',limit:1000,
    parameters:{datasets:[],filters:[{key:'$metadata.service',operation:'eq',type:'string',value:name}]}
  }});
  const events=logs.result?.events?.events??[];
  const telemetryRecords=cpuTelemetryRecords(events,version.versionId);
  report.cpuTelemetry={http:logs.status,success:logs.ok,returnedEvents:events.length,
    versionFilteredSamples:telemetryRecords.length,
    cpuMs:summary(telemetryRecords.map(record=>record.cpuTimeMs).filter(value=>Number.isFinite(value)&&value>=0)),
    wallMs:summary(telemetryRecords.map(record=>record.wallTimeMs).filter(value=>Number.isFinite(value)&&value>=0)),records:telemetryRecords};
  report.coldCpuSamples=correlateColdCpuSamples(coldSamples,telemetryRecords);
  const firstLogs=await api('/workers/observability/telemetry/query',{method:'POST',body:{
    queryId:'r4-cpu-first-'+runId,dry:true,
    timeframe:{from:Date.parse(report.firstRequestWindow.start),to:Date.parse(report.firstRequestWindow.end)},
    view:'events',limit:1000,
    parameters:{datasets:[],filters:[{key:'$metadata.service',operation:'eq',type:'string',value:name}]}
  }});
  const firstEvents=firstLogs.result?.events?.events??[];
  const firstTelemetryRecords=cpuTelemetryRecords(firstEvents,version.versionId);
  report.firstRequestTelemetry={http:firstLogs.status,success:firstLogs.ok,returnedEvents:firstEvents.length,
    versionFilteredSamples:firstTelemetryRecords.length,records:firstTelemetryRecords};
  report.firstRequestCpu=correlateColdCpuSamples([firstSample],firstTelemetryRecords)[0];
  report.firstRequestCpuAssessment=summarizeFirstRequestCpu(report.firstRequestCpu);
  report.privateCountsAfter=await qCounts();
  assert.deepEqual(report.privateCountsAfter,before,'Existing synthetic fixture counts changed');
  report.cacheAssessment=summarizePublicCacheProbe(samples,report.cpuAnalytics,report.coldCpuSamples);
  report.cacheAssessment.firstRequestCpuAssessment=report.firstRequestCpuAssessment;
  report.status=!report.firstRequestCpuAssessment.qualified?(report.firstRequestCpuAssessment.overLimit?
      'PUBLIC_HOME_FIRST_REQUEST_CPU_ABOVE_FREE_LIMIT':'PUBLIC_HOME_FIRST_REQUEST_CPU_UNQUALIFIED'):
    !report.cacheAssessment.cacheHotPathVerified?'CACHE_OR_CPU_NOT_PROVEN':
    report.cacheAssessment.reason==='COLD_CPU_ABOVE_FREE_LIMIT'?'PUBLIC_HOME_CACHE_VERIFIED_COLD_CPU_ABOVE_FREE_LIMIT':
    report.cacheAssessment.coldCpuMeasurementQualified?'COLD_CPU_WITHIN_LIMIT_COST_AND_PRODUCER_UNVERIFIED':
    'PUBLIC_HOME_CACHE_VERIFIED_COLD_CPU_UNQUALIFIED';
}catch(error){
  report.status='BLOCKED_OR_FAILED_CLOSED';report.failure=String(error?.message??'Unknown').slice(0,230);
  process.exitCode=1;
}finally{
  try{
    if(allocated){
      const listed=await api('/workers/scripts');
      assert.ok(listed.ok&&Array.isArray(listed.result),'Cleanup inventory unavailable');
      if(listed.result.some(w=>w.id===name)){
        assert.ok(wrangler(['delete',name,'--config',configPath,'--force']),
          'Ephemeral Worker deletion failed');
        report.deleted=1;
      }
    }
    const after=await api('/workers/scripts');
    report.cleanupVerified=after.ok&&Array.isArray(after.result)&&
      !after.result.some(w=>w.id===name);
    assert.ok(report.cleanupVerified,'Ephemeral Worker cleanup not verified');
    if(oldCount!==null) assert.equal(after.result.length,oldCount,'Unexplained Worker inventory change');
  }catch(error){
    report.status='CLEANUP_UNVERIFIED';report.cleanupError=String(error?.message??'Unknown').slice(0,230);
    process.exitCode=1;
  }
  await writeFile('outputs/r4-cpu-ephemeral.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
