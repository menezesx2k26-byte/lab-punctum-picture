import {summarizeSubscriptions} from './r4-images-preflight.mjs';
const ACCOUNT='257bca437616da74ece1ce4bbaf0bd89';
const SOURCE_ID='2e7710f3-dc92-4aeb-976a-5f15d8c5262c';
const SOURCE_NAME='punctum-picture-r4-qa-20261028';
const COLD_CPU_REQUIRED_SAMPLES=12;
const FREE_CPU_LIMIT_MS=10;

export function delayUntilNextCpuSample(nowMs){
  if(!Number.isSafeInteger(nowMs)||nowMs<0)throw new RangeError('Expected epoch milliseconds');
  return (Math.floor(nowMs/1000)+1)*1000+150-nowMs;
}
export function cpuQaEligibility({subscriptions,workers,databases,name}) {
  const plan=summarizeSubscriptions(subscriptions);
  const subscriptionIds=Array.isArray(subscriptions)
    ? subscriptions.map(row=>String(row?.id??'').trim().toLowerCase()).filter(Boolean) : [];
  const allowed=plan.workerPlan==='free' &&
    Array.isArray(workers)&&workers.length<95&&workers.length>=0 &&
    Array.isArray(databases) &&
    databases.some(db=>db.name===SOURCE_NAME&&db.uuid===SOURCE_ID) &&
    typeof name==='string'&&/^punctum-r4-cpu-probe-[0-9]{5,15}$/.test(name)&&
    !workers.some(w=>w.id===name);
  return {allowed,reason:allowed?'ISOLATED_PUBLIC_READS_ONLY':'INSUFFICIENT_READONLY_PREFLIGHT',
    workerPlan:plan.workerPlan,r2PaidSubscriptionPresent:subscriptionIds.includes('r2_paid'),
    incrementalCostVerified:false};
}
export function cpuQaFixtureEligibility(counts){
  return !!counts&&Number(counts.pointers)===1&&Number(counts.configVersions)>=1&&
    Number(counts.validPublishedPointers)===1;
}

export function cpuQaWorkerConfig(name,origin,token) {
  if (!/^punctum-r4-cpu-probe-[0-9]{5,15}$/.test(name))
    throw Error('Unrecognized ephemeral name');
  const url=new URL(origin);
  if(url.origin!==origin||url.protocol!=='https:'||
    !url.hostname.startsWith(name+'.')||!url.hostname.endsWith('.workers.dev'))
    throw Error('Expected ephemeral workers.dev origin only');
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))
    throw Error('Missing ephemeral authentication token');
  return {
    name,account_id:ACCOUNT,main:'r4-cpu-entry.mjs',no_bundle:true,
    version_metadata:{binding:'QA_VERSION'},
    rules:[{type:'ESModule',globs:['**/*.js','**/*.mjs']}],
    compatibility_date:'2026-11-07',compatibility_flags:['nodejs_compat'],
    exports:{default:{type:'worker',cache:{enabled:false}},PublicHome:{type:'worker',cache:{enabled:true}}},
    workers_dev:true,preview_urls:false,routes:[],triggers:{crons:[]},
    observability:{enabled:true,logs:{invocation_logs:true,head_sampling_rate:1}},
    assets:{directory:'../client',binding:'ASSETS',
      not_found_handling:'single-page-application',run_worker_first:['/*']},
    vars:{R4_CPU_PROBE_TOKEN:token,PUBLIC_HOME_CACHE_ENABLED:'true',
      ENVIRONMENT:'preview',PRIVATE_GALLERIES_ENABLED:'false',
      CLIENT_AUTH_MODE:'access',SITE_ORIGIN:origin,PUBLIC_SITE_URL:origin,
      PUBLIC_WHATSAPP_E164:'UNSPECIFIED',PUBLIC_INSTAGRAM_URL:'UNSPECIFIED'},
    d1_databases:[{binding:'DB',database_name:SOURCE_NAME,database_id:SOURCE_ID}],
    r2_buckets:[]
  };
}

const validCpu=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const rayId=value=>typeof value==='string'&&/^[a-f0-9]{16}(?:-[a-z]+)?$/i.test(value)
  ? value.split('-')[0].toLowerCase() : null;

/** Keep invalid CPU values visible: filtering them out could approve partial telemetry. */
export function cpuTelemetryRecords(events,versionId){
  return (Array.isArray(events)?events:[]).filter(event=>
    event?.$workers?.scriptVersion?.id===versionId&&event?.$metadata?.type==='cf-worker-event')
    .map(event=>({timestamp:event.timestamp,cpuTimeMs:event.$workers.cpuTimeMs??null,
      wallTimeMs:event.$workers.wallTimeMs??null,versionId:event.$workers.scriptVersion.id,
      requestId:event.$workers.requestId??event.$metadata.requestId??null,
      rayId:event.$metadata.rayId??null,
      entrypoint:event.$workers.entrypoint??(event.$workers.eventType==='fetch'?'default':null),
      outcome:event.$workers.outcome??null}));
}

/** Correlate both entrypoint invocations, without approving time-window-only evidence. */
export function correlateColdCpuSamples(requestSamples,telemetryRecords){
  const records=Array.isArray(telemetryRecords)?telemetryRecords:[];
  // Cloudflare Observability returns `timestamp` as Unix epoch milliseconds
  // (number), not an ISO string. Keep string support for archived fixtures,
  // but never pass a numeric epoch through Date.parse(), which treats it as
  // date text and silently drops the real per-invocation CPU samples.
  const epochMs=value=>typeof value==='number'&&Number.isFinite(value)?value:
    typeof value==='string'?Date.parse(value):NaN;
  return (Array.isArray(requestSamples)?requestSamples:[]).map(request=>{
    const started=Date.parse(request?.startedAt);
    const finished=Date.parse(request?.finishedAt);
    const withinSingleSecond=Number.isFinite(started)&&Number.isFinite(finished)&&finished>=started&&
      Math.floor(started/1000)===Math.floor(finished/1000);
    const matching=Number.isFinite(started)&&Number.isFinite(finished)?records.filter(event=>{
      const timestamp=epochMs(event?.timestamp);
      return Number.isFinite(timestamp)&&timestamp>=started-500&&timestamp<=finished+500;
    }):[];
    const cpuTimes=matching.map(event=>event?.cpuTimeMs).filter(validCpu);
    const invocationEvidenceComplete=matching.length===2&&
      typeof request.versionId==='string'&&request.versionId.length>0&&rayId(request.rayId)!==null&&
      matching.every(event=>validCpu(event.cpuTimeMs)&&event.versionId===request.versionId&&
        rayId(event.rayId)===rayId(request.rayId)&&event.outcome==='ok'&&
        typeof event.requestId==='string'&&event.requestId.length>0)&&
      new Set(matching.map(event=>event.requestId)).size===2&&
      matching.some(event=>event.entrypoint==='default')&&
      matching.some(event=>event.entrypoint==='PublicHome');
    return {...request,withinSingleSecond,invocationEvidenceComplete,telemetryEvents:matching.length,
      invalidCpuEvents:matching.length-cpuTimes.length,
      cpuTimeMsMax:cpuTimes.length?Math.max(...cpuTimes):null};
  });
}

/** Twelve isolated MISSes with exact per-request telemetry are required. */
export function summarizeColdCpuMeasurement(samples){
  const rows=Array.isArray(samples)?samples:[];
  const missingTelemetrySamples=rows.filter(sample=>sample.invocationEvidenceComplete!==true||
    sample.telemetryEvents!==2||!validCpu(sample.cpuTimeMsMax)).length;
  const overLimitSamples=rows.filter(sample=>Number.isFinite(sample.cpuTimeMsMax)&&
    sample.cpuTimeMsMax>FREE_CPU_LIMIT_MS).length;
  const unqualifiedSamples=rows.filter(sample=>sample.status!==200||sample.validHtml!==true||
    !['MISS','EXPIRED'].includes(sample.cacheStatus)||sample.withinSingleSecond!==true||
    sample.invocationEvidenceComplete!==true||sample.telemetryEvents!==2||!validCpu(sample.cpuTimeMsMax)||
    sample.cpuTimeMsMax>FREE_CPU_LIMIT_MS).length;
  const cpuTimes=rows.map(sample=>sample.cpuTimeMsMax).filter(value=>
    typeof value==='number'&&Number.isFinite(value));
  const qualified=rows.length===COLD_CPU_REQUIRED_SAMPLES&&unqualifiedSamples===0;
  return {requiredSamples:COLD_CPU_REQUIRED_SAMPLES,observedSamples:rows.length,qualified,
    missingTelemetrySamples,overLimitSamples,unqualifiedSamples,
    maxCpuTimeMs:cpuTimes.length?Math.max(...cpuTimes):null,
    freeCpuLimitMs:FREE_CPU_LIMIT_MS};
}

/** The first authenticated request after deploy is a separate CPU gate. */
export function summarizeFirstRequestCpu(sample){
  const telemetryEvents=sample?.telemetryEvents;
  const cpuTimeMsMax=sample?.cpuTimeMsMax;
  const requestValid=sample?.status===200&&sample?.validHtml===true&&
    ['MISS','EXPIRED'].includes(sample?.cacheStatus);
  const telemetryComplete=sample?.withinSingleSecond===true&&sample?.invocationEvidenceComplete===true&&
    telemetryEvents===2&&validCpu(cpuTimeMsMax);
  const overLimit=Number.isFinite(cpuTimeMsMax)&&cpuTimeMsMax>FREE_CPU_LIMIT_MS;
  return {qualified:requestValid&&telemetryComplete&&!overLimit,requestValid,
    telemetryComplete,overLimit,telemetryEvents:Number.isSafeInteger(telemetryEvents)?telemetryEvents:0,
    cpuTimeMsMax:Number.isFinite(cpuTimeMsMax)?cpuTimeMsMax:null,freeCpuLimitMs:FREE_CPU_LIMIT_MS};
}

/**
 * Cache HITs do not qualify cold CPU. Even twelve passing cold samples leave
 * cost/headroom and a trusted snapshot producer as separate G17 requirements.
 */
export function summarizePublicCacheProbe(samples,cpuAnalytics,coldCpuSamples=[]){
  const statusDistribution={};const cacheStatuses={};
  for(const sample of samples){
    const status=String(sample.status);
    statusDistribution[status]=(statusDistribution[status]??0)+1;
    const cache=sample.cacheStatus??'none';
    cacheStatuses[cache]=(cacheStatuses[cache]??0)+1;
  }
  const hitCount=cacheStatuses.HIT??0;
  const allHtml=samples.length===36&&samples.every(s=>s.status===200&&s.validHtml===true);
  const cacheHotPathVerified=allHtml&&hitCount>=30&&(cacheStatuses.BYPASS??0)===0;
  const highCpu=Array.isArray(cpuAnalytics)&&cpuAnalytics.some(s=>
    typeof s.cpuP99==='number'&&s.cpuP99>10000);
  const coldCpu=summarizeColdCpuMeasurement(coldCpuSamples);
  const reason=!cacheHotPathVerified?'CACHE_NOT_VERIFIED':
    highCpu||coldCpu.overLimitSamples>0?'COLD_CPU_ABOVE_FREE_LIMIT':
    !coldCpu.qualified?'COLD_CPU_TELEMETRY_INCOMPLETE':
    'COLD_CPU_WITHIN_LIMIT_COST_AND_PRODUCER_UNVERIFIED';
  return {statusDistribution,cacheStatuses,hitCount,cacheHotPathVerified,
    coldCpuMeasurementQualified:coldCpu.qualified,coldCpu,
    freeCpuGatePassed:false,reason};
}
