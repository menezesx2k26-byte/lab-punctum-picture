// Bounded one-raster Images binding test in an EPHEMERAL QA Worker only.
// No D1, no R2, no production domains, no Client Access, no external images.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {decideFreeEphemeralProbe} from './lib/r4-images-preflight.mjs';

const ACCOUNT='257bca437616da74ece1ce4bbaf0bd89';
const runId=process.env.GITHUB_RUN_ID;
assert.equal(process.env.GITHUB_ACTIONS,'true','CI only');
assert.equal(process.env.R4_IMAGES_EPHEMERAL_QA,'true','Explicit synthetic QA opt-in required');
assert.match(runId??'',/^[0-9]{5,15}$/,'GitHub Action run ID required');
const token=process.env.CLOUDFLARE_API_TOKEN;
assert.ok(token,'Cloudflare account-scoped token required');
const name='punctum-r4-images-probe-'+runId;
const report={observedAt:new Date().toISOString(),sourceSha:process.env.GITHUB_SHA,
  target:name,mode:'EPHEMERAL_ONE_SYNTHETIC_IMAGE_ONLY',remoteDataAccess:false,
  d1Queries:0,r2Operations:0,productionTouched:false,paidPlansChanged:false,
  imagesStored:0,deployments:0,deletions:0,status:'PREFLIGHT',steps:[],cleanupVerified:false};
await mkdir('outputs',{recursive:true});
const api=async path=>{
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,{
    method:'GET',headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(18000)});
  const body=await response.json().catch(()=>({success:false}));
  return {ok:response.ok&&body.success===true,value:body.result??null,status:response.status};
};
const wrangler=async args=>{
  const result=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args],{
    encoding:'utf8',timeout:90_000,maxBuffer:4*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  // The CLI can echo variables; never include stdout/stderr in reports or logs.
  return result.status===0;
};
const configPath=resolve('outputs/r4-images-ephemeral-qa.wrangler.json');
let allocationAuthorized=false,oldCount=null;
try{
  const [subs,all,subdomain]=await Promise.all([api('/subscriptions'),api('/workers/scripts'),api('/workers/subdomain')]);
  assert.ok(subs.ok && Array.isArray(subs.value),'Complete subscription inventory required');
  assert.ok(all.ok && Array.isArray(all.value),'Complete Worker inventory required');
  assert.ok(subdomain.ok && typeof subdomain.value?.subdomain==='string','Existing Workers subdomain required');
  oldCount=all.value.length;
  const summaries=subs.value.map(s=>({id:s.rate_plan?.id}));
  const readiness=decideFreeEphemeralProbe({subscriptions:summaries,workerCount:oldCount,
    scriptName:name,existingWorkerNames:all.value.map(w=>w.id),accountVerified:true});
  report.preflight={subscriptions:[...new Set(summaries.map(s=>s.id).filter(Boolean))],
    workerCount:oldCount,uniqueName:true,decision:readiness};
  assert.ok(readiness.mayDeploy,'Free plan or vacant script capacity not independently established');
  allocationAuthorized=true;
  const nonce=randomBytes(32).toString('base64url');
  console.log('::add-mask::'+nonce);
  const config={name,account_id:ACCOUNT,main:'../scripts/r4-images-probe-worker.mjs',
    compatibility_date:'2026-05-22',workers_dev:true,preview_urls:false,
    routes:[],triggers:{crons:[]},images:{binding:'IMAGES'},
    vars:{R4_QA_PROBE_TOKEN:nonce},observability:{enabled:false}};
  await writeFile(configPath,JSON.stringify(config));
  report.steps.push('Free subscription and absent script verified; no D1/R2 bindings');
  const deployed=await wrangler(['deploy','--config',configPath]);
  if(!deployed)throw new Error('Ephemeral Worker deployment failed');
  report.deployments=1;
  const settings=await api('/workers/scripts/'+name+'/settings');
  assert.ok(settings.ok&&Array.isArray(settings.value?.bindings),'Worker settings require readback');
  const bindings=settings.value.bindings;
  assert.ok(bindings.some(b=>b.name==='IMAGES'&&b.type==='images'),'Expected Images binding absent');
  assert.ok(!bindings.some(b=>['DB','ORIGINALS','BACKUPS','ASSETS'].includes(b.name)),'Unexpected persistent data binding');
  report.steps.push('Dedicated runtime Images binding verified, persistent bindings absent');
  const origin='https://'+name+'.'+subdomain.value.subdomain+'.workers.dev';
  let reached=false;
  for(let i=0;i<15;i++){
    try {
      const denied=await fetch(origin+'/probe',{redirect:'error',signal:AbortSignal.timeout(12000)});
      if(denied.status!==404)throw new Error('Unauthenticated access must return 404');
      const response=await fetch(origin+'/probe',{headers:{'X-R4-QA-Probe-Token':nonce},
        redirect:'error',signal:AbortSignal.timeout(15000)});
      const value=await response.json().catch(()=>null);
      if(response.status===200&&value?.ok===true&&value.sourceWidth===2&&value.sourceHeight===2
        &&value.outputFormat==='image/png'&&Number.isSafeInteger(value.transformedByteLength)&&value.transformedByteLength>4){
        reached=true;report.synthetic={status:200,sourceWidth:2,sourceHeight:2,
          transformedBytes:value.transformedByteLength,originalsFromUsers:false};
        break;
      }
      if(response.status>=500)throw new Error('Images binding synthetic runtime unavailable HTTP '+response.status);
    }catch(e){
      if(/unavailable HTTP|Unauthenticated/.test(e.message))throw e;
    }
    await new Promise(done=>setTimeout(done,1000));
  }
  assert.ok(reached,'Ephemeral synthetic image was not verified at exact workers.dev origin');
  report.steps.push('One private 2x2 PNG successfully decoded, transformed, and served in Worker');
  report.status='SYNTHETIC_IMAGES_BINDING_PASSED';
}catch(e){
  report.status='FAILED_CLOSED';report.failure=String(e?.message??'QA failed').slice(0,220);
  process.exitCode=1;
}finally{
  // Never delete a pre-existing script: a fresh name was checked and generated
  // from a GitHub run ID. Deletion is limited to this run's ephemeral Worker.
  try{
    if(allocationAuthorized){
      // A timed-out deploy may have created the script even if Wrangler reports
      // failure. Re-read exact ID before cleanup; never delete an inherited name.
      const beforeCleanup=await api('/workers/scripts');
      assert.ok(beforeCleanup.ok&&Array.isArray(beforeCleanup.value),'Cleanup inventory unavailable');
      const found=beforeCleanup.value.some(w=>w.id===name);
      if(found){
        const deleted=await wrangler(['delete',name,'--config',configPath,'--force']);
        if(!deleted)throw new Error('Newly created ephemeral Worker cleanup failed');
        report.deletions=1;
      }
    }
    const after=await api('/workers/scripts');
    report.cleanupVerified=after.ok&&Array.isArray(after.value)&&!after.value.some(w=>w.id===name);
    if(!report.cleanupVerified)throw new Error('Script inventory after QA could not prove cleanup');
    report.afterWorkerCount=after.value.length;
    if(oldCount!==null&&report.afterWorkerCount!==oldCount)
      throw new Error('Worker inventory count changed during QA');
    if(report.status==='SYNTHETIC_IMAGES_BINDING_PASSED') report.status='SYNTHETIC_IMAGES_BINDING_PASSED_AND_CLEANED';
  }catch(error){report.status='CLEANUP_UNVERIFIED';report.cleanupError=String(error?.message??'unknown');process.exitCode=1;}
  await writeFile('outputs/r4-images-ephemeral-qa.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}