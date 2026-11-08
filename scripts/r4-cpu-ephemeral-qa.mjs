// Public-home CPU measurement on a one-run ephemeral Worker. Never reuse or modify
// historical QA Worker, production domains, migrations, or private gallery records.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {cpuQaEligibility,cpuQaWorkerConfig} from './lib/r4-cpu-readonly.mjs';

const ACCOUNT='257bca437616da74ece1ce4bbaf0bd89';
const SOURCE_ID='2e7710f3-dc92-4aeb-976a-5f15d8c5262c';
assert.equal(process.env.GITHUB_ACTIONS,'true','Actions only');
assert.equal(process.env.R4_CPU_READONLY_QA,'true','Explicit synthetic CPU QA opt-in');
const runId=process.env.GITHUB_RUN_ID;
assert.match(runId??'',/^[0-9]{5,15}$/,'Expected unique GitHub run ID');
const token=process.env.CLOUDFLARE_API_TOKEN;
assert.ok(token,'Account-scoped token missing');
const name='punctum-r4-cpu-probe-'+runId;
const report={observedAt:new Date().toISOString(),sha:process.env.GITHUB_SHA,
  name,mode:'PUBLIC_READONLY_EPHEMERAL',productionTouched:false,
  historicalWorkerTouched:false,privateWrites:0,assetsModified:false,
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
    (SELECT COUNT(*) FROM site_config_pointers) AS pointers`;
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
    planIds:subscriptions.result.map(s=>s.rate_plan?.id),eligibility};
  assert.ok(eligibility.allowed,'Account free/DB/slot/name proof missing');
  assert.match(subdomain.result?.subdomain??'',/^[a-z0-9-]+$/);
  const origin='https://'+name+'.'+subdomain.result.subdomain+'.workers.dev';
  const before=await qCounts();
  report.privateCountsBefore=before;
  const probeToken=randomBytes(32).toString('hex');
  console.log('::add-mask::'+probeToken);
  const config=cpuQaWorkerConfig(name,origin,probeToken);
  await copyFile(resolve('scripts/r4-cpu-guard.mjs'),resolve('dist/server/r4-cpu-guard.mjs'));
  await writeFile(resolve('dist/server/r4-cpu-entry.mjs'),
    "import app from './index.js';\nimport {cpuProbeFetch} from './r4-cpu-guard.mjs';\nexport {PublicHome} from './index.js';\nexport default {fetch(req,env,ctx){return cpuProbeFetch(req,env,ctx,app)}};\n");
  await writeFile(configPath,JSON.stringify(config));
  allocated=true;
  assert.ok(wrangler(['deploy','--config',configPath]),'Read-only Worker deploy failed');
  report.created=1;
  const scriptSettings=await api('/workers/scripts/'+name+'/settings');
  assert.ok(scriptSettings.ok,'Cannot verify ephemeral Worker settings');
  const bindings=scriptSettings.result?.bindings??[];
  assert.ok(bindings.some(b=>b.name==='DB'&&b.type==='d1'),
    'Synthetic D1 binding absent');
  assert.ok(!bindings.some(b=>['ORIGINALS','BACKUPS','IMAGES'].includes(b.name)),
    'Unexpected media or image binding');
  const unauthenticated=await fetch(origin+'/',{redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert.equal(unauthenticated.status,404,'Unauthorized root must be closed');
  const forbiddenMethod=await fetch(origin+'/',{method:'POST',
    headers:{'X-R4-CPU-Probe':probeToken},redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert.equal(forbiddenMethod.status,404,'Mutating methods must be closed');
  const samples=[];
  for(let i=0;i<36;i++){
    const started=performance.now();
    const response=await fetch(origin+'/',{headers:{Accept:'text/html','X-R4-CPU-Probe':probeToken},redirect:'manual',
      signal:AbortSignal.timeout(20000)});
    const body=await response.text();
    samples.push({status:response.status,cacheStatus:response.headers.get('CF-Cache-Status'),latencyMs:Math.round(performance.now()-started),
      validHtml:body.includes('</html>')});
  }
  report.http={cacheStatuses:samples.reduce((counts,sample)=>({...counts,[sample.cacheStatus??'none']:(counts[sample.cacheStatus??'none']??0)+1}),{}),total:samples.length,success:samples.filter(s=>s.status===200&&s.validHtml).length,
    errors:samples.filter(s=>s.status!==200||!s.validHtml).length,
    latencyMs:summary(samples.map(s=>s.latencyMs))};
  report.measurementWindow={start:new Date(Date.now()-100000).toISOString(),end:new Date().toISOString()};
  await new Promise(resolve=>setTimeout(resolve,15000));
  const query='query($accountTag:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$accountTag}){workersInvocationsAdaptive(limit:1000,filter:{scriptName:"'+name+'",datetime_geq:$start,datetime_lt:$end}){sum{requests errors} quantiles{cpuTimeP50 cpuTimeP95 cpuTimeP99}}}}}';
  const result=await fetch('https://api.cloudflare.com/client/v4/graphql',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({query,variables:{accountTag:ACCOUNT,start:report.measurementWindow.start,
      end:new Date().toISOString()}}),signal:AbortSignal.timeout(20000)});
  const parsed=await result.json().catch(()=>({}));
  const groups=parsed.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  report.cpuAnalytics=Array.isArray(groups)?groups.map(x=>({
    samples:x.sum?.requests??null,errors:x.sum?.errors??null,cpuP50:x.quantiles?.cpuTimeP50??null,
    cpuP95:x.quantiles?.cpuTimeP95??null,cpuP99:x.quantiles?.cpuTimeP99??null})):null;
  report.privateCountsAfter=await qCounts();
  assert.deepEqual(report.privateCountsAfter,before,'Existing synthetic fixture counts changed');
  report.status=report.http.errors===0&&Array.isArray(report.cpuAnalytics)&&
    report.cpuAnalytics.length>0&&
    report.cpuAnalytics.every(x=>x.errors===0&&x.cpuP99!==null&&x.cpuP99<=10000)
    ? 'CPU_CANDIDATE_CONDITIONAL_PASS':'CPU_NOT_PROVEN';
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
