import test from 'node:test';
import assert from 'node:assert/strict';
import {cpuQaEligibility,cpuQaWorkerConfig,summarizePublicCacheProbe} from './lib/r4-cpu-readonly.mjs';
import {cpuProbeFetch} from './r4-cpu-guard.mjs';

const good={subscriptions:[{id:'free'},{id:'r2_paid'}],workers:[{id:'other'}],
  databases:[{uuid:'2e7710f3-dc92-4aeb-976a-5f15d8c5262c',name:'punctum-picture-r4-qa-20261028'}],
  name:'punctum-r4-cpu-probe-42437156639'};

test('read-only CPU probe requires free account, synthetic DB and never-used name',()=>{
  assert.equal(cpuQaEligibility(good).allowed,true);
  for (const invalid of [
    {...good,subscriptions:[{id:'workers_paid'}]},
    {...good,workers:[{id:good.name}]},
    {...good,workers:Array.from({length:96},(_,i)=>({id:'w'+i}))},
    {...good,databases:[]},
    {...good,databases:[{uuid:good.databases[0].uuid,name:'wrong'}]},
    {...good,name:'punctum-picture-migration'},
  ]) assert.equal(cpuQaEligibility(invalid).allowed,false);
});

test('ephemeral CPU worker excludes real routes, R2, Images, and background jobs',()=>{
  const config=cpuQaWorkerConfig(good.name,'https://'+good.name+'.example.workers.dev','a'.repeat(64));
  assert.equal(config.main,'r4-cpu-entry.mjs');
  assert.equal(config.vars.R4_CPU_PROBE_TOKEN,'a'.repeat(64));
  assert.equal(config.name,good.name);
  assert.deepEqual(config.routes,[]);
  assert.deepEqual(config.triggers,{crons:[]});
  assert.equal(config.vars.PRIVATE_GALLERIES_ENABLED,'false');
  assert.equal(config.vars.ENVIRONMENT,'preview');
  assert.deepEqual(config.r2_buckets,[]);
  assert.equal(config.images,undefined);
  assert.deepEqual(config.d1_databases.map(x=>x.database_id),[good.databases[0].uuid]);
  assert.equal(config.assets.directory,'../client');
  assert.ok(!('secrets_store_secrets' in config));
});

test('refuse production domains and arbitrary origins in isolated probe',()=>{
  for(const origin of ['https://punctumpicture.com','http://localhost','https://evil.com'])
    assert.throws(()=>cpuQaWorkerConfig(good.name,origin));
  assert.throws(()=>cpuQaWorkerConfig('punctum-picture-migration','https://punctum-picture-migration.example.workers.dev'));
});
test('only authenticated root GET may reach the full app under CPU probe',async()=>{
  let touched=0;
  const app={fetch:()=>{touched++;return Response.json({ok:true})}};
  const env={R4_CPU_PROBE_TOKEN:'a'.repeat(64)};
  const origin='https://punctum-r4-cpu-probe-42437156639.example.workers.dev';
  for(const [path,method,token] of [['/','GET',null],['/','POST',env.R4_CPU_PROBE_TOKEN],
    ['/api/public/site','GET',env.R4_CPU_PROBE_TOKEN],['/?secret=1','GET',env.R4_CPU_PROBE_TOKEN]]){
    const res=await cpuProbeFetch(new Request(origin+path,{method,headers:token?{'X-R4-CPU-Probe':token}:{}}),env,{},app);
    assert.equal(res.status,404);
  }
  assert.equal(touched,0);
  const allowed=await cpuProbeFetch(new Request(origin+'/',{headers:{'X-R4-CPU-Probe':env.R4_CPU_PROBE_TOKEN}}),env,{},app);
  assert.equal(allowed.status,200);
  assert.equal(touched,1);
});

test('Workers Cache is restricted to PublicHome named entrypoint, not the privileged default',()=>{
  const config=cpuQaWorkerConfig(good.name,'https://'+good.name+'.example.workers.dev','a'.repeat(64));
  assert.equal(config.vars.PUBLIC_HOME_CACHE_ENABLED,'true');
  assert.deepEqual(config.exports,{default:{type:'worker',cache:{enabled:false}},PublicHome:{type:'worker',cache:{enabled:true}}});
  assert.equal(config.compatibility_date,'2026-11-07');
});

test('cache QA does not promote a warm hit when HTML or CPU cold misses are unproven',()=>{
  const warm=Array.from({length:36},(_,i)=>({status:200,validHtml:true,cacheStatus:i===0?'MISS':'HIT',latencyMs:100}));
  const result=summarizePublicCacheProbe(warm,[{samples:2,errors:0,cpuP99:80000}]);
  assert.equal(result.hitCount,35);
  assert.equal(result.cacheHotPathVerified,true);
  assert.equal(result.freeCpuGatePassed,false);
  assert.equal(result.reason,'COLD_CPU_ABOVE_FREE_LIMIT');
  const rejected=summarizePublicCacheProbe([{status:200,validHtml:true,cacheStatus:'BYPASS'}],[{samples:1,errors:0,cpuP99:450}]);
  assert.equal(rejected.cacheHotPathVerified,false);
  assert.equal(rejected.freeCpuGatePassed,false);
});
