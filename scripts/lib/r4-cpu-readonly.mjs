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
    compatibility_date:'2026-05-22',compatibility_flags:['nodejs_compat'],
    workers_dev:true,preview_urls:false,routes:[],triggers:{crons:[]},
    observability:{enabled:true,logs:{head_sampling_rate:1}},
    assets:{directory:'../client',binding:'ASSETS',
      not_found_handling:'single-page-application',run_worker_first:['/*']},
    vars:{R4_CPU_PROBE_TOKEN:token,ENVIRONMENT:'preview',PRIVATE_GALLERIES_ENABLED:'false',
      CLIENT_AUTH_MODE:'access',SITE_ORIGIN:origin,PUBLIC_SITE_URL:origin,
      PUBLIC_WHATSAPP_E164:'UNSPECIFIED',PUBLIC_INSTAGRAM_URL:'UNSPECIFIED'},
    d1_databases:[{binding:'DB',database_name:SOURCE_NAME,database_id:SOURCE_ID}],
    r2_buckets:[]
  };
}
