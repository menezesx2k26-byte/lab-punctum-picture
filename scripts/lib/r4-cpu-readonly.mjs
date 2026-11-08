import {summarizeSubscriptions} from './r4-images-preflight.mjs';
const ACCOUNT='257bca437616da74ece1ce4bbaf0bd89';
const SOURCE_ID='2e7710f3-dc92-4aeb-976a-5f15d8c5262c';
const SOURCE_NAME='punctum-picture-r4-qa-20261028';
export function cpuQaEligibility({subscriptions,workers,databases,name}) {
  const plan=summarizeSubscriptions(subscriptions);
  const allowed=plan.workerPlan==='free' &&
    Array.isArray(workers)&&workers.length<95&&workers.length>=0 &&
    Array.isArray(databases) &&
    databases.some(db=>db.name===SOURCE_NAME&&db.uuid===SOURCE_ID) &&
    typeof name==='string'&&/^punctum-r4-cpu-probe-[0-9]{5,15}$/.test(name)&&
    !workers.some(w=>w.id===name);
  return {allowed,reason:allowed?'ISOLATED_PUBLIC_READS_ONLY':'INSUFFICIENT_READONLY_PREFLIGHT'};
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
    rules:[{type:'ESModule',globs:['**/*.js','**/*.mjs']}],
    compatibility_date:'2026-11-07',compatibility_flags:['nodejs_compat'],
    exports:{default:{type:'worker',cache:{enabled:false}},PublicHome:{type:'worker',cache:{enabled:true}}},
    workers_dev:true,preview_urls:false,routes:[],triggers:{crons:[]},
    observability:{enabled:true,logs:{head_sampling_rate:1}},
    assets:{directory:'../client',binding:'ASSETS',
      not_found_handling:'single-page-application',run_worker_first:['/*']},
    vars:{R4_CPU_PROBE_TOKEN:token,PUBLIC_HOME_CACHE_ENABLED:'true',ENVIRONMENT:'preview',PRIVATE_GALLERIES_ENABLED:'false',
      CLIENT_AUTH_MODE:'access',SITE_ORIGIN:origin,PUBLIC_SITE_URL:origin,
      PUBLIC_WHATSAPP_E164:'UNSPECIFIED',PUBLIC_INSTAGRAM_URL:'UNSPECIFIED'},
    d1_databases:[{binding:'DB',database_name:SOURCE_NAME,database_id:SOURCE_ID}],
    r2_buckets:[]
  };
}

/**
 * A successful benchmark run does not prove Workers Free cold CPU compliance.
 * Cache HITs skip the named SSR handler, but every cache MISS can still spend
 * >10ms CPU, and adaptive GraphQL quantiles sample only a subset.
 */
export function summarizePublicCacheProbe(samples,cpuAnalytics){
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
  return {statusDistribution,cacheStatuses,hitCount,cacheHotPathVerified,
    freeCpuGatePassed:false,reason:highCpu?'COLD_CPU_ABOVE_FREE_LIMIT':
      cacheHotPathVerified?'SAMPLED_CPU_NOT_FULL_COLD_PROOF':'CACHE_NOT_VERIFIED'};
}
