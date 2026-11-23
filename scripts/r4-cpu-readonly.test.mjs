import test from 'node:test';
import assert from 'node:assert/strict';
import {cpuQaEligibility,cpuQaFixtureEligibility,cpuQaWorkerConfig,summarizePublicCacheProbe,
  correlateColdCpuSamples,summarizeColdCpuMeasurement,summarizeFirstRequestCpu,cpuTelemetryRecords,
  delayUntilNextCpuSample} from './lib/r4-cpu-readonly.mjs';
import {cpuProbeFetch} from './r4-cpu-guard.mjs';

const good={subscriptions:[{id:'free'},{id:'r2_paid'}],workers:[{id:'other'}],
  databases:[{uuid:'2e7710f3-dc92-4aeb-976a-5f15d8c5262c',name:'punctum-picture-r4-qa-20261028'}],
  name:'punctum-r4-cpu-probe-42437156639'};

test('read-only CPU probe requires free account, synthetic DB and never-used name',()=>{
  const eligibility=cpuQaEligibility(good);
  assert.equal(eligibility.allowed,true);
  assert.equal(eligibility.workerPlan,'free');
  assert.equal(eligibility.r2PaidSubscriptionPresent,true);
  assert.equal(eligibility.incrementalCostVerified,false);
  for (const invalid of [
    {...good,subscriptions:[{id:'workers_paid'}]},
    {...good,workers:[{id:good.name}]},
    {...good,workers:Array.from({length:96},(_,i)=>({id:'w'+i}))},
    {...good,databases:[]},
    {...good,databases:[{uuid:good.databases[0].uuid,name:'wrong'}]},
    {...good,name:'punctum-picture-migration'},
  ]) assert.equal(cpuQaEligibility(invalid).allowed,false);
});

test('CPU QA refuses to start if the synthetic D1 would need public-config bootstrap',()=>{
  assert.equal(cpuQaFixtureEligibility({pointers:1,configVersions:2,validPublishedPointers:1}),true);
  assert.equal(cpuQaFixtureEligibility({pointers:0,configVersions:0,validPublishedPointers:0}),false);
  assert.equal(cpuQaFixtureEligibility({pointers:1,configVersions:0,validPublishedPointers:0}),false);
  assert.equal(cpuQaFixtureEligibility({pointers:2,configVersions:2,validPublishedPointers:1}),false);
});

test('ephemeral CPU worker excludes real routes, R2, Images, and background jobs',()=>{
  const config=cpuQaWorkerConfig(good.name,'https://'+good.name+'.example.workers.dev','a'.repeat(64));
  assert.equal(config.main,'r4-cpu-entry.mjs');
  assert.equal(config.vars.R4_CPU_PROBE_TOKEN,'a'.repeat(64));
  assert.equal(config.name,good.name);
  assert.deepEqual(config.version_metadata,{binding:'QA_VERSION'});
  assert.deepEqual(config.routes,[]);
  assert.deepEqual(config.triggers,{crons:[]});
  assert.equal(config.vars.PRIVATE_GALLERIES_ENABLED,'false');
  assert.equal(Object.hasOwn(config.vars,'PUBLIC_HOME_SNAPSHOT_ENABLED'),false,
    'Cache MISS CPU probe must leave the snapshot shortcut disabled');
  assert.equal(config.vars.ENVIRONMENT,'preview');
  assert.deepEqual(config.r2_buckets,[]);
  assert.equal(config.images,undefined);
  assert.deepEqual(config.d1_databases.map(x=>x.database_id),[good.databases[0].uuid]);
  assert.equal(config.assets.directory,'../client');
  assert.deepEqual(config.observability.logs,{invocation_logs:true,head_sampling_rate:1});
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

function coldRequests(){
  return Array.from({length:12},(_,index)=>{
    const start=Date.UTC(2026,10,12,1,0,index*3+1);
    return {index:index+1,versionId:'version-1',rayId:(index+1).toString(16).padStart(16,'0')+'-GRU',startedAt:new Date(start).toISOString(),
      finishedAt:new Date(start+120).toISOString(),status:200,cacheStatus:'MISS',validHtml:true};
  });
}

function coldEvents(requests,cpuTimeMs=8.5){
  return requests.flatMap(sample=>[
    {timestamp:sample.startedAt,cpuTimeMs,versionId:'version-1',rayId:sample.rayId,
      requestId:'root-'+sample.index,entrypoint:'default',outcome:'ok'},
    {timestamp:new Date(Date.parse(sample.startedAt)+20).toISOString(),cpuTimeMs:4.2,versionId:'version-1',
      rayId:sample.rayId.split('-')[0],requestId:'home-'+sample.index,entrypoint:'PublicHome',outcome:'ok'},
  ]);
}

test('cold MISS CPU telemetry correlates exact per-request events and qualifies twelve samples',()=>{
  const requests=coldRequests();
  const correlated=correlateColdCpuSamples(requests,coldEvents(requests));
  assert.equal(correlated.length,12);
  assert.equal(correlated[0].telemetryEvents,2);
  assert.equal(correlated[0].cpuTimeMsMax,8.5);
  const measurement=summarizeColdCpuMeasurement(correlated);
  assert.equal(measurement.qualified,true);
  assert.equal(measurement.observedSamples,12);
  assert.equal(measurement.maxCpuTimeMs,8.5);
  const warm=Array.from({length:36},(_,i)=>({status:200,validHtml:true,
    cacheStatus:i===0?'MISS':'HIT',latencyMs:100}));
  const result=summarizePublicCacheProbe(warm,[],correlated);
  assert.equal(result.cacheHotPathVerified,true);
  assert.equal(result.coldCpuMeasurementQualified,true);
  assert.equal(result.freeCpuGatePassed,false);
  assert.equal(result.reason,'COLD_CPU_WITHIN_LIMIT_COST_AND_PRODUCER_UNVERIFIED');
});

test('Cloudflare Observability numeric epoch-millisecond timestamps correlate to cold requests',()=>{
  const requests=coldRequests();
  const events=coldEvents(requests).map(event=>({...event,timestamp:Date.parse(event.timestamp)}));
  const correlated=correlateColdCpuSamples(requests,events);
  assert.equal(correlated[0].telemetryEvents,2);
  assert.equal(correlated[0].cpuTimeMsMax,8.5);
  assert.equal(summarizeColdCpuMeasurement(correlated).qualified,true);
});

test('first authenticated request requires an exact cache MISS and per-invocation CPU under 10ms',()=>{
  const request={...coldRequests()[0],cacheStatus:'MISS'};
  const events=coldEvents([request],9.9);
  const correlated=correlateColdCpuSamples([request],events)[0];
  assert.equal(summarizeFirstRequestCpu(correlated).qualified,true);
  assert.equal(summarizeFirstRequestCpu({...correlated,cpuTimeMsMax:10.001}).overLimit,true);
  assert.equal(summarizeFirstRequestCpu({...correlated,telemetryEvents:0,cpuTimeMsMax:null}).qualified,false);
  assert.equal(summarizeFirstRequestCpu({...correlated,cacheStatus:'HIT'}).qualified,false);
});

test('cold CPU measurement fails closed on missing telemetry, a cache HIT, ambiguous events, or a second over 10ms',()=>{
  const requests=coldRequests();
  const events=coldEvents(requests);
  const missing=correlateColdCpuSamples(requests,events.slice(0,-2));
  assert.equal(summarizeColdCpuMeasurement(missing).qualified,false);
  assert.equal(summarizeColdCpuMeasurement(missing).missingTelemetrySamples,1);

  const hitRequests=requests.map((sample,index)=>index===0?{...sample,cacheStatus:'HIT'}:sample);
  assert.equal(summarizeColdCpuMeasurement(correlateColdCpuSamples(hitRequests,events)).qualified,false);

  const ambiguous=correlateColdCpuSamples(requests,[...events,
    {timestamp:requests[0].startedAt,cpuTimeMs:2.1,versionId:'version-1'}]);
  assert.equal(summarizeColdCpuMeasurement(ambiguous).qualified,false);

  const overLimit=correlateColdCpuSamples(requests,coldEvents(requests).map((event,index)=>
    index===14?{...event,cpuTimeMs:10.001}:event));
  assert.equal(summarizeColdCpuMeasurement(overLimit).qualified,false);
  assert.equal(summarizeColdCpuMeasurement(overLimit).overLimitSamples,1);
});

test('cold CPU telemetry does not qualify when a request crosses the analytics second boundary',()=>{
  const requests=coldRequests();
  requests[0].finishedAt=new Date(Date.parse(requests[0].startedAt)+1200).toISOString();
  const correlated=correlateColdCpuSamples(requests,coldEvents(requests));
  assert.equal(correlated[0].withinSingleSecond,false);
  assert.equal(summarizeColdCpuMeasurement(correlated).qualified,false);
});

test('scoped synthetic purge is authenticated and cannot mutate private routes',async()=>{
  const env={R4_CPU_PROBE_TOKEN:'a'.repeat(64)};
  const origin='https://punctum-r4-cpu-probe-42437156639.example.workers.dev';
  let purges=0,appCalls=0;
  const ctx={exports:{PublicHome:{purgeCache:async()=>{purges++;return true}}}};
  const app={fetch:async()=>{appCalls++;return Response.json({bad:true})}};
  const denied=await cpuProbeFetch(new Request(origin+'/probe-purge',{method:'POST'}),env,ctx,app);
  assert.equal(denied.status,404);
  const accepted=await cpuProbeFetch(new Request(origin+'/probe-purge',{method:'POST',headers:{'X-R4-CPU-Probe':env.R4_CPU_PROBE_TOKEN}}),env,ctx,app);
  assert.equal(accepted.status,200);
  assert.equal(purges,1);
  assert.equal(appCalls,0);
});

test('CPU evidence rejects a missing or invalid invocation instead of keeping only the valid maximum',()=>{
  const requests=coldRequests();
  for(const invalid of [undefined,null,-1,NaN,Infinity,'8']){
    const events=coldEvents(requests).map((event,index)=>index===0?{...event,cpuTimeMs:invalid}:event);
    assert.equal(summarizeColdCpuMeasurement(correlateColdCpuSamples(requests,events)).qualified,false,
      'partial or invalid CPU must not qualify: '+String(invalid));
  }
  assert.equal(summarizeFirstRequestCpu({...requests[0],telemetryEvents:1,cpuTimeMsMax:-1}).qualified,false);
});

test('CPU evidence rejects a lone default invocation and cannot qualify an inverted first-request window',()=>{
  const requests=coldRequests();
  const rootOnly=coldEvents(requests).filter((_,index)=>index%2===0);
  assert.equal(summarizeColdCpuMeasurement(correlateColdCpuSamples(requests,rootOnly)).qualified,false);
  const request={...requests[0],finishedAt:new Date(Date.parse(requests[0].startedAt)-100).toISOString()};
  assert.equal(summarizeFirstRequestCpu(correlateColdCpuSamples([request],coldEvents([request]))[0]).qualified,false);
});

test('CPU evidence requires both distinct invocations from the same Ray, deployed version and successful outcome',()=>{
  const requests=coldRequests();
  for(const mutation of [
    {versionId:'other-version'}, {rayId:'ffffffffffffffff'}, {rayId:null},
    {requestId:'root-1'}, {requestId:''}, {entrypoint:'default'}, {outcome:'exceededCpu'},
  ]){
    const events=coldEvents(requests).map((event,index)=>index===1?{...event,...mutation}:event);
    assert.equal(summarizeColdCpuMeasurement(correlateColdCpuSamples(requests,events)).qualified,false,
      JSON.stringify(mutation));
  }
  const unidentified=requests.map((request,index)=>index===0?{...request,rayId:null}:request);
  assert.equal(summarizeColdCpuMeasurement(correlateColdCpuSamples(unidentified,coldEvents(requests))).qualified,false);
});

test('Observability extraction preserves incomplete invocations and excludes custom logs and other versions',()=>{
  const make=(worker={},metadata={})=>({timestamp:1794492000000,
    $metadata:{type:'cf-worker-event',rayId:'0000000000000001-GRU',...metadata},
    $workers:{scriptVersion:{id:'version-1'},eventType:'fetch',requestId:'r1',outcome:'ok',cpuTimeMs:2,...worker}});
  const records=cpuTelemetryRecords([make(),make({cpuTimeMs:undefined,entrypoint:'PublicHome',requestId:'r2'}),
    make({}, {type:'cf-worker-log'}),make({scriptVersion:{id:'other'}})],'version-1');
  assert.equal(records.length,2);
  assert.equal(records[0].entrypoint,'default');
  assert.equal(records[1].entrypoint,'PublicHome');
  assert.equal(records[1].cpuTimeMs,null);
  const request={...coldRequests()[0],startedAt:new Date(1794492000000).toISOString(),
    finishedAt:new Date(1794492000100).toISOString()};
  const partial=correlateColdCpuSamples([request],records)[0];
  assert.equal(partial.invalidCpuEvents,1);
  assert.equal(summarizeFirstRequestCpu(partial).qualified,false);
});

test('CPU sample waits until the next second plus 150ms even when current second is past that point',()=>{
  assert.equal(delayUntilNextCpuSample(1000),1150);
  assert.equal(delayUntilNextCpuSample(1150),1000);
  assert.equal(delayUntilNextCpuSample(1999),151);
  assert.equal(delayUntilNextCpuSample(2000),1150);
  for(const invalid of [-1,NaN,Infinity,null,'1999'])assert.throws(()=>delayUntilNextCpuSample(invalid));
});
