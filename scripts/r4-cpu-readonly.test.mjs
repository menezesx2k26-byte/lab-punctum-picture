import test from 'node:test';
import assert from 'node:assert/strict';
import {cpuQaEligibility,cpuQaWorkerConfig} from './lib/r4-cpu-readonly.mjs';
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
