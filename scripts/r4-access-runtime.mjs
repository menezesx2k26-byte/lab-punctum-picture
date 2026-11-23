// Operational current-head deployment into the existing OTP-only QA app.
// No Access changes, migrations, resources, credentials or SQL writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {privatePreviewConfig} from './lib/private-preview.mjs';

const worker='punctum-picture-albums-qa';
const dbId='b5087ae7-8c28-40eb-b541-8a58755131d3';
const ownerId='901c78ff-2808-452b-9770-561f9ebcbd0b';
const origin='https://'+worker+'.menezesx2k26.workers.dev';
const account='257bca437616da74ece1ce4bbaf0bd89';

export function accessRuntimeConfig(base,settings,sha) {
 assert.match(sha,/^[a-f0-9]{40}$/);
 const bindings=settings.bindings;
 const binding=name=>bindings.find(b=>b.name===name);
 assert.equal(binding('DB')?.id,dbId,'Only effective historical QA binding may be retained');
 assert.equal(binding('ORIGINALS')?.bucket_name,'punctum-picture-albums-qa-restored');
 assert.equal(binding('BACKUPS')?.bucket_name,'punctum-picture-albums-qa-backups');
 assert.equal(binding('IMAGES')?.type,'images','Never activate a missing Images binding');
 const vars=Object.fromEntries(bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
 assert.equal(vars.CLIENT_AUTH_MODE,'access');assert.equal(vars.PRIVATE_GALLERIES_ENABLED,'true');
 assert.equal(vars.ENVIRONMENT,'preview','Existing runtime must remain QA preview');
 assert.equal(vars.SITE_ORIGIN,origin,'Retain only the exact QA mutation origin');
 if(vars.PUBLIC_SITE_URL!==undefined)assert.equal(vars.PUBLIC_SITE_URL,origin,'Public URLs must stay on QA');
 assert.equal(vars.CLIENT_ACCESS_TEAM_DOMAIN,'shiny-violet-50ae.cloudflareaccess.com');
 assert.equal(vars.CLIENT_ACCESS_AUD,'e97a5fc50e1fa426f2bf06af68905b76871a598ab1201dd14c0441c11b8e919c');
 const config=privatePreviewConfig(base,{databaseId:dbId,origin,restored:true,accessTeamDomain:vars.CLIENT_ACCESS_TEAM_DOMAIN,accessAudience:vars.CLIENT_ACCESS_AUD});
 config.vars={...vars,PUBLIC_SITE_URL:vars.PUBLIC_SITE_URL??origin,QA_BUILD_SHA:sha};config.keep_vars=true;
 config.version_metadata={binding:'QA_VERSION'};
 config.main='r4-access-wrapper.mjs';
 delete config.services;
 return config;
}

async function run() {
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.R4_ACCESS_QA_EXECUTE,'true');
 const report={observedAt:new Date().toISOString(),sourceSha:process.env.GITHUB_SHA,worker,origin,productionTouched:false,sqlWrites:0,migrations:0,accessChanges:0,newImageBindings:0,deployments:0};
 await mkdir('outputs',{recursive:true});
 const api=async(path,body)=>{
   const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
   const data=await response.json();assert.equal(data.success,true,'QA provider operation failed HTTP'+response.status);return data.result;
 };
 const snapshot=async()=>{
   const data=await api('/d1/database/'+dbId+'/query',{sql:'SELECT * FROM client_accounts ORDER BY id'});
   const rows=data[0].results;
   assert.equal(rows.length,6,'Preserve the five original clients and single QA owner mapping');
   const owner=rows.find(row=>row.id===ownerId);assert.ok(owner && !owner.disabled_at && owner.must_change_password===0,'Expected active synthetic owner mapping');
   return {count:rows.length,originalFiveDigest:createHash('sha256').update(JSON.stringify(rows.filter(row=>row.id!==ownerId))).digest('hex'),ownerPresent:true};
 };
 try {
   const settings=await api('/workers/scripts/'+worker+'/settings');
   const previous=await api('/workers/scripts/'+worker+'/deployments');
   report.previousVersionId=previous.deployments[0].versions[0].version_id;
   const base=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
   const config=accessRuntimeConfig(base,settings,process.env.GITHUB_SHA);
   report.before=await snapshot();
   const wrapper=`import worker from './index.js';\nexport default {async fetch(request,env,ctx){const response=await worker.fetch(request,env,ctx);const headers=new Headers(response.headers);headers.set('X-QA-Build',env.QA_BUILD_SHA);headers.set('X-QA-Version',env.QA_VERSION.id);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}};\n`;
   await writeFile('dist/server/r4-access-wrapper.mjs',wrapper);
   const path=resolve('dist/server/r4-access-qa.wrangler.json');await writeFile(path,JSON.stringify(config));
   const result=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'deploy','--config',path],{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
   assert.equal(result.status,0,'Existing QA deployment failed; inspect provider without replaying writes');report.deployments=1;
   report.after=await snapshot();assert.deepEqual(report.after,report.before,'QA deployment must not mutate client rows');
   const deployed=await api('/workers/scripts/'+worker+'/deployments');report.versionId=deployed.deployments[0].versions[0].version_id;
   let observed=false;
   for(let i=0;i<10;i++){
     const r=await fetch(origin+'/api/client/me',{redirect:'manual',signal:AbortSignal.timeout(15000)});await r.arrayBuffer();
     if(r.status===401 && r.headers.get('X-QA-Build')===process.env.GITHUB_SHA && r.headers.get('X-QA-Version')===report.versionId){observed=true;break;}
     await new Promise(resolve=>setTimeout(resolve,1000));
   }
   assert.ok(observed,'Current SHA/version not yet verified at QA runtime; do not declare deployed');
   report.status='CURRENT_HEAD_QA_RUNTIME_VERIFIED';
 } catch(error){report.status='FAILED_NO_REPLAY';report.failure=error.message;process.exitCode=1;}
 finally {await writeFile('outputs/r4-access-runtime.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await run();
