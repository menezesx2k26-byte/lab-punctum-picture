// Read-only, credential-masked CI runner. Never deploys, edits bindings or mutates D1/R2.
import { mkdir,writeFile } from 'node:fs/promises';
import { summarizeSubscriptions,summarizeImageUsage,decideImageQaReadiness,isCloudflareProbeSuccess } from './lib/r4-images-preflight.mjs';
const ACCOUNT='257bca437616da74ece1ce4bbaf0bd89';
const QA_WORKER='punctum-picture-r4-qa-20261028';
if(process.env.GITHUB_ACTIONS!=='true')throw new Error('Only credential-masked GitHub Actions may run account probes');
const today=new Date().toISOString().slice(0,10);
const report={schemaVersion:1,observedAt:new Date().toISOString(),sourceSha:process.env.GITHUB_SHA??null,
  target:'punctum-r4-dedicated-QA',mode:'READ_ONLY',writes:0,
  accountResourcesTouched:false,secretsRecorded:false,candidates:[],status:'RUNNING'};
await mkdir('outputs',{recursive:true});
const safeError=value => Array.isArray(value?.errors) ? value.errors.map(e=>({code:typeof e?.code==='number'?e.code:null})): [];
async function probe(token,path,method='GET',payload) {
  try {
    const response=await fetch('https://api.cloudflare.com/client/v4'+path,{
      method,headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{}),redirect:'error',signal:AbortSignal.timeout(18000)});
    const json=await response.json().catch(()=>({success:false,errors:[]}));
    return {status:response.status,success:isCloudflareProbeSuccess(path,response.ok,json),result:json.result??null,data:json.data??null,
      errors:safeError(json),graphqlErrors:Array.isArray(json.errors)&&path==='/graphql'?json.errors.length:0};
  }catch{return {status:'NETWORK_ERROR',success:false,result:null,data:null,errors:[],graphqlErrors:0};}
}
const base='/accounts/'+ACCOUNT;
let latestCandidate=null;
for(const [index,envName] of ['CF_TOKEN_1','CF_TOKEN_2','CF_TOKEN_3'].entries()){
  const token=process.env[envName];
  if(!token)continue;
  const candidate={tokenSlot:index+1,probes:{},workerConfig:null,subscription:null,imagesStats:null,
    imagesTransformations:null,inventory:null,decision:null};
  const [subscriptions,imagesStats,workerSettings,workerPlan,d1,r2,workerList]=await Promise.all([
    probe(token,base+'/subscriptions'),
    probe(token,base+'/images/v1/stats'),
    probe(token,base+'/workers/scripts/'+QA_WORKER+'/settings'),
    probe(token,base+'/workers/account-settings'),
    probe(token,base+'/d1/database?per_page=100'),
    probe(token,base+'/r2/buckets'),
    probe(token,base+'/workers/scripts')]);
  for(const [key,value] of Object.entries({subscriptions,imagesStats,workerSettings,workerPlan,d1,r2,workerList}))
    candidate.probes[key]={http:value.status,success:value.success,errors:value.errors};
  const rows=subscriptions.success&&Array.isArray(subscriptions.result)
    ? subscriptions.result.map(s=>({id:s.rate_plan?.id,product:s.rate_plan?.public_name,price:s.price,currency:s.currency,state:s.state})) : null;
  candidate.subscription=rows===null?null:rows.map(s=>({id:s.id??null,price:Number.isFinite(Number(s.price))?Number(s.price):null,
    state:s.state??null}));
  const plan=summarizeSubscriptions(rows);
  candidate.workerConfig=workerSettings.success
    ? {bindingNames:Array.isArray(workerSettings.result?.bindings) ?
      workerSettings.result.bindings.filter(b=>['DB','ORIGINALS','BACKUPS','IMAGES','QA_VERSION'].includes(b.name))
      .map(b=>({name:b.name,type:b.type})):[],hasImagesBinding:workerSettings.result?.bindings?.some(b=>b.name==='IMAGES')??false}
    : null;
  candidate.imagesStats=imagesStats.success ? {imagesStored:imagesStats.result?.count?.current??null,
    storageLimit:imagesStats.result?.count?.allowed??null,notTransformationAllowance:true}:null;
  candidate.inventory={
    d1Accessible:d1.success,d1Count:Array.isArray(d1.result)?d1.result.length:null,
    expectedSourcePresent:Array.isArray(d1.result)&&d1.result.some(d=>d.name==='punctum-picture-r4-qa-20261028'&&d.uuid==='2e7710f3-dc92-4aeb-976a-5f15d8c5262c'),
    expectedRestorePresent:Array.isArray(d1.result)&&d1.result.some(d=>d.name==='punctum-picture-r4-restore-20261028'&&d.uuid==='0141b8f9-3074-4aa4-a184-92a4f7379ecc'),
    r2Accessible:r2.success,expectedBucketsPresent:r2.success&&['punctum-r4-qa-originals-20261028','punctum-r4-qa-restored-20261028','punctum-r4-qa-backups-20261028'].every(name=>(r2.result?.buckets??[]).some(b=>b.name===name)),
    qaWorkerPresent:workerList.success&&Array.isArray(workerList.result)&&workerList.result.some(w=>w.id===QA_WORKER)
  };
  const month=today.slice(0,7),start=month+'-01';
  const graphql=await probe(token,'/graphql','POST',{query:`query($accountTag:String!,$start:Date!,$end:Date!){viewer{accounts(filter:{accountTag:$accountTag}){imagesUniqueTransformationsAccumulatedSinceStartOfMonth(filter:{date_geq:$start,date_leq:$end},limit:40){date transformations}}}}`,
    variables:{accountTag:ACCOUNT,start,end:today}});
  candidate.probes.graphql={http:graphql.status,success:graphql.success&&graphql.graphqlErrors===0,errors:graphql.errors,graphqlErrorCount:graphql.graphqlErrors};
  const gqlRows=graphql.data?.viewer?.accounts?.[0]?.imagesUniqueTransformationsAccumulatedSinceStartOfMonth;
  const usage=summarizeImageUsage(graphql.success&&graphql.graphqlErrors===0?gqlRows:null,today);
  candidate.imagesTransformations={current:usage.current,observedDate:usage.observedDate,
    isInvoiceProof:false,source:gqlRows===undefined?'unknown':'graphql'};
  candidate.decision=decideImageQaReadiness({
    plan:plan.plan,workerPlan:plan.workerPlan,transformations:usage.current,
    source:graphql.success&&graphql.graphqlErrors===0&&Array.isArray(gqlRows)?'graphql':'unknown'});
  report.candidates.push(candidate);
  if(candidate.decision.mayAttemptSyntheticQa&&candidate.inventory.expectedSourcePresent&&candidate.inventory.expectedRestorePresent
    &&candidate.inventory.expectedBucketsPresent&&candidate.inventory.qaWorkerPresent)latestCandidate=candidate.tokenSlot;
}
report.safeCandidateTokenSlot=latestCandidate;
report.status=latestCandidate===null?'READ_ONLY_INCOMPLETE_NO_QA_AUTHORIZATION':'READ_ONLY_QA_CANDIDATE_ONLY';
report.productionDecision='NO_GO';
await writeFile('outputs/r4-images-preflight.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
// A successful preflight is still not authorization to create resources, run transforms or enable production.