import assert from 'node:assert/strict';
import { r4VacancyListing, r4ObservedOneListing, inspectR4ReadyVersion } from './lib/r4-recovery-qa.mjs';

test('inspector waits only for a prior deployment and never accepts or retries current-version 403',async()=>{
 const calls=[];
 const replies=[new Response(null,{status:403,headers:{'X-QA-Version':'old'}}),Response.json({ready:true},{headers:{'X-QA-Version':'current'}})];
 const options={origin:'https://punctum-picture-r4-qa-20261028.test.workers.dev',secret:'test-only-secret',versionId:'current',pause:async()=>{},attempts:2};
 assert.deepEqual(await inspectR4ReadyVersion({...options,fetch:async(url,init)=>{calls.push({url,method:init.method});return replies.shift()}}),{ready:true});
 assert.ok(calls.every(c=>c.method==='GET'&&c.url.endsWith('/qa/inspect')));
 let deniedCalls=0;
 await assert.rejects(()=>inspectR4ReadyVersion({...options,fetch:async()=>{deniedCalls++;return new Response(null,{status:403,headers:{'X-QA-Version':'current'}})}}),/current-version.*403/i);
 assert.equal(deniedCalls,1);
 await assert.rejects(()=>inspectR4ReadyVersion({...options,fetch:async()=>Response.json({stale:true},{headers:{'X-QA-Version':'old'}})}),/not propagate/i);
});

test('accepts only the live verified empty R2 envelope when optional pagination is omitted', () => {
  const observed={success:true,errors:[],messages:[],result:[]};
  assert.deepEqual(r4VacancyListing(observed),{objects:[],truncated:false});
  for(const unsafe of [
    {...observed,result:[{key:'unknown'}]},
    {...observed,success:false},
    {...observed,result_info:null},
    {...observed,result_info:{cursor:'next-page'}},
    {...observed,errors:[{code:1}]},
  ]) assert.throws(()=>r4VacancyListing(unsafe));
});
test('one legacy R2 object may be observed with omitted pagination, but final count requires Worker R2.list',()=>{
 const live={success:true,errors:[],messages:[],result:[{key:'qa-legacy-object'}]};
 assert.equal(r4ObservedOneListing(live),1);
 for(const changed of [
  {...live,result:[]},{...live,result:[{key:'x'},{key:'y'}]},
  {...live,result_info:{cursor:'next-page'}},{...live,errors:[{code:1}]},
  {...live,success:false},{...live,result:[{key:'x'},{key:'x'}]},
 ])assert.throws(()=>r4ObservedOneListing(changed));
});
import { test } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import { createScopedFixtureReceipt, validateScopedFixtureReceipt } from './lib/r4-scoped-fixture.mjs';
import { R4_QA, R4_RESUME_DATABASES } from './lib/r4-edge-qa.mjs';
import {
  assertR4RecoveryScope, r4RecoveryWorkerConfig, signR4QaAdminCookie,
  signR4QaClientCookie, assertR4RecoveryPreflight, assertR4RecoveryVacant,
  assertR4FlagDisabledCandidateConfig, withR4QaRestoration,
  assertR4ScopedExisting, assertR4ScopedBudget, r4ScopedRecoveryWorkerConfig,
} from './lib/r4-recovery-qa.mjs';

const origin = 'https://' + R4_QA.worker + '.example.workers.dev';
const expected = R4_RESUME_DATABASES.map(d => d.id);
const clientIds = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];

test('R4 recovery scope accepts only immutable interrupted allocation, two unique synthetic clients and dedicated origin', () => {
  const base = { origin, sourceId:expected[0], restoreId:expected[1], clientIds };
  assert.doesNotThrow(() => assertR4RecoveryScope(base));
  for (const change of [
    {sourceId:'0801d4f1-7c85-4db4-8643-7b7c9e34862c'},
    {restoreId:expected[0]}, {origin:'https://punctumpicture.com'},
    {origin:'https://punctum-picture-albums-qa.example.workers.dev'},
    {clientIds:[clientIds[0]]}, {clientIds:[clientIds[0],clientIds[0]]},
    {clientIds:[clientIds[0],'not-a-uuid']},
  ]) assert.throws(() => assertR4RecoveryScope({...base,...change}));
});

test('R4 recovery config strips inherited production routes and binds only dedicated QA resources', () => {
  const config = r4RecoveryWorkerConfig({origin,clientIds,sourceId:expected[0],restoreId:expected[1]});
  assert.equal(config.name,R4_QA.worker);
  assert.equal(config.main,'../scripts/private-recovery-worker.ts');
  assert.deepEqual(config.routes,[]);
  assert.deepEqual(config.triggers,{crons:[]});
  assert.equal(config.vars.QA_RECOVERY_CLIENT_IDS,clientIds.join(','));
  assert.equal(config.vars.QA_RECOVERY_ALLOCATION,'r4-20261028');
  assert.equal(config.vars.ENVIRONMENT,'preview');
  assert.deepEqual(config.d1_databases.map(d=>[d.binding,d.database_id]),[['SOURCE_DB',expected[0]],['RESTORE_DB',expected[1]]]);
  assert.deepEqual(config.r2_buckets.map(b=>b.bucket_name),[R4_QA.originals,R4_QA.restored,R4_QA.backups]);
  assert.equal(config.vars.CLIENT_ACCESS_AUD,undefined);
  assert.equal(config.vars.ADMIN_SESSION_SECRET,undefined);
});

test('admin cookie uses credential-revision HMAC and client QA cookie is explicitly synthetic', () => {
  const secret='fake-admin-secret-for-unit-tests',passwordHash=createHash('sha256').update('test-password').digest('hex');
  const admin=signR4QaAdminCookie({secret,passwordHash,now:1_700_000_000});
  const [payload,mac]=admin.split('.');
  assert.equal(JSON.parse(Buffer.from(payload,'base64url').toString()).email,'qa@punctum.invalid');
  const independentRuntimeKey=Buffer.concat([Buffer.from(secret),Buffer.from([0]),Buffer.from('env:'+passwordHash)]);
  assert.equal(mac,createHmac('sha256',independentRuntimeKey).update(payload).digest('base64url'));
  assert.notEqual(mac,createHmac('sha256',secret+'\\0env:'+passwordHash).update(payload).digest('base64url'),'Slash-zero HMAC key must not be accepted');
  assert.notEqual(mac,createHmac('sha256',secret).update(payload).digest('base64url'));
  const client=signR4QaClientCookie({clientId:clientIds[0],sessionVersion:1,secret:'fake-client-secret',now:1_700_000_000});
  const body=JSON.parse(Buffer.from(client.split('.')[0],'base64url').toString());
  assert.deepEqual({sub:body.sub,version:body.version,audience:body.audience},{sub:clientIds[0],version:1,audience:'punctum-client-access'});
});

const measured=(label,failures=0)=>({label,errors:failures,versionMismatches:0,samples:Array.from({length:64},(_,index)=>({index,status:index<failures?503:200,actualVersionId:index<failures?null:label+'-version'})),versionId:label+'-version'});
test('R4 independent recovery accepts verified public SSR HTTP 503 but never masks G17 failure', () => {
  const base={resume:true,origin,resources:R4_QA,r2Storage:{accessible:true},r2Operations:{accessible:true},workerUsage:{accessible:true},d1Usage:{accessible:true},
    budget:{databaseCount:10,workerRequestsToday:100},d1Budget:{rowsRead:1000,rowsWritten:100},
    created:{databases:R4_RESUME_DATABASES,buckets:[R4_QA.originals,R4_QA.restored,R4_QA.backups]},
    performance:[measured('baseline',10),measured('candidate',17)],
    rollback:{status:200,restoredCandidate:{versionId:'candidate-version'}},stage:'performance-complete',functionalQa:'NOT_RUN',status:'PERFORMANCE_QA_WITH_REQUEST_FAILURES'};
  assert.doesNotThrow(()=>assertR4RecoveryPreflight(base));
  assert.equal(base.status,'PERFORMANCE_QA_WITH_REQUEST_FAILURES','Public home failure must remain reported');
  for(const change of [
    {resume:false},{stage:'baseline-performance'},
    {r2Storage:{accessible:false}},{d1Usage:{accessible:false}},{d1Budget:{rowsRead:5_000_000,rowsWritten:100}},
    {budget:{databaseCount:11,workerRequestsToday:100}},
    {resources:{...R4_QA,source:'historical-qa'}},
    {rollback:null},{created:{databases:[R4_RESUME_DATABASES[0]]}},
    {created:{databases:R4_RESUME_DATABASES,buckets:[R4_QA.originals]}},
    {performance:[measured('candidate'),measured('baseline')]},
    {performance:[{...measured('baseline',10),versionMismatches:1},measured('candidate',17)]},
    {performance:[{...measured('baseline',10),errors:0},measured('candidate',17)]},
    {performance:[{...measured('baseline',10),samples:[{status:503}]},measured('candidate',17)]},
    {performance:[{...measured('baseline',10),samples:measured('baseline',10).samples.map((s,i)=>i===0?{...s,status:401}:s)},measured('candidate',17)]},
    {performance:[{...measured('baseline',10),samples:measured('baseline',10).samples.map((s,i)=>i===25?{...s,actualVersionId:'wrong-version'}:s)},measured('candidate',17)]},
    {functionalQa:'PASS'},
  ]) assert.throws(()=>assertR4RecoveryPreflight({...base,...change}));
});

test('candidate restore is fail-safe on QA functional failure, preserves primary error, and never marks full PASS',async()=>{
 const report={status:'PERFORMANCE_QA_WITH_REQUEST_FAILURES',functionalQa:'NOT_RUN',recovery:{status:'SOURCE_APP_DEPLOYING'}};
 const calls=[];
 await assert.rejects(withR4QaRestoration(report,async()=>{calls.push('work');throw Error('private API HTTP 503')},async()=>{calls.push('restore')}),/private API HTTP 503/);
 assert.deepEqual(calls,['work','restore']);
 assert.equal(report.status,'PERFORMANCE_QA_WITH_REQUEST_FAILURES');
 assert.equal(report.functionalQa,'FAILED_PRIVATE_QA');
 assert.equal(report.recovery.candidateRestoration,'RESTORED_FLAG_DISABLED');
 assert.match(report.recovery.failure,/private API HTTP 503/);
});
test('candidate restore failure cannot erase original failure; success requires restore verification',async()=>{
 const original={status:'PERFORMANCE_QA_WITH_REQUEST_FAILURES',functionalQa:'NOT_RUN',recovery:{}};
 await assert.rejects(withR4QaRestoration(original,async()=>{throw Error('original fail')},async()=>{throw Error('restore fail')}),/original fail/);
 assert.equal(original.recovery.candidateRestoration,'FAILED');
 assert.match(original.recovery.candidateRestorationError,/restore fail/);
 const successful={status:'PERFORMANCE_QA_WITH_REQUEST_FAILURES',functionalQa:'NOT_RUN',recovery:{}};
 await assert.rejects(withR4QaRestoration(successful,async()=>{successful.functionalQa='QA_SYNTHETIC_RECOVERY_VERIFIED'},async()=>{throw Error('restore fail')}),/restore fail/);
 assert.equal(successful.functionalQa,'FAILED_CANDIDATE_RESTORATION');
 assert.equal(successful.status,'PERFORMANCE_QA_WITH_REQUEST_FAILURES');
});
test('flag-disabled candidate configuration retains only exact QA worker, source DB, no private routes',()=>{
 const base={name:R4_QA.worker,main:'r4-version-wrapper.mjs',workers_dev:true,routes:[],triggers:{crons:[]},
  vars:{ENVIRONMENT:'preview',SITE_ORIGIN:origin,PRIVATE_GALLERIES_ENABLED:'false',CLIENT_AUTH_MODE:'access',CLIENT_ACCESS_AUD:'r4-qa-access-unconfigured'},
  d1_databases:[{binding:'DB',database_id:expected[0]}],r2_buckets:[]};
 assert.doesNotThrow(()=>assertR4FlagDisabledCandidateConfig(base,origin));
 for(const change of [{routes:[{pattern:'punctumpicture.com'}]},{r2_buckets:[{bucket_name:R4_QA.restored}]},
  {d1_databases:[{binding:'DB',database_id:expected[1]}]},{vars:{...base.vars,PRIVATE_GALLERIES_ENABLED:'true'}},
  {main:'index.js'}])assert.throws(()=>assertR4FlagDisabledCandidateConfig({...base,...change},origin));
});

test('fresh R4 recovery refuses any preexisting client relation, originals or backup object', () => {
  const vacant={source:{client_accounts:0,client_galleries:0,client_gallery_images:0,client_gallery_upload_intents:0,client_gallery_favorites:0},restore:{client_accounts:0,client_galleries:0,client_gallery_images:0,client_gallery_upload_intents:0,client_gallery_favorites:0},objects:{originals:0,restored:0,backups:0}};
  assert.doesNotThrow(()=>assertR4RecoveryVacant(vacant));
  for(const changed of [
    {source:{...vacant.source,client_accounts:5}},
    {restore:{...vacant.restore,client_gallery_favorites:1}},
    {objects:{...vacant.objects,backups:1}},
    {objects:{...vacant.objects,restored:null}},
  ]) assert.throws(()=>assertR4RecoveryVacant({...vacant,...changed}));
});

test('scoped G18 explicitly preserves one known failed case and permits only an empty destination',()=>{
 const counts={source:{client_accounts:1,client_galleries:1,client_gallery_images:1,client_gallery_upload_intents:1,client_gallery_favorites:0},restore:{client_accounts:0,client_galleries:0,client_gallery_images:0,client_gallery_upload_intents:0,client_gallery_favorites:0}};
 const objects={originals:1,restored:0,backups:0};
 assert.equal(assertR4ScopedExisting({...counts,objects}),true);
 for(const changed of [
  {source:{...counts.source,client_accounts:5}},
  {source:{...counts.source,client_gallery_images:2}},
  {restore:{...counts.restore,client_accounts:1}},
  {objects:{...objects,originals:0}},
  {objects:{...objects,restored:1}},
  {objects:{...objects,backups:1}},
 ]) assert.throws(()=>assertR4ScopedExisting({...counts,objects,...changed}));
});

test('scoped recovery rejects missing fresh quota evidence or unexpected resource ownership',()=>{
 const verified={resources:R4_QA,created:{databases:R4_RESUME_DATABASES,buckets:[R4_QA.originals,R4_QA.restored,R4_QA.backups]},r2Storage:{accessible:true},r2Operations:{accessible:true},workerUsage:{accessible:true},d1Usage:{accessible:true},budget:{databaseCount:3,workerRequestsToday:100,r2:{maximumStorageBytes:1000,classARequests:2,classBRequests:3},subscriptions:[{id:'free'}],namesInUse:[R4_QA.source]},d1Budget:{rowsRead:100,rowsWritten:100}};
 assert.equal(assertR4ScopedBudget(verified),true);
 for(const bad of [{d1Usage:{accessible:false}},{r2Operations:{accessible:false}},{resources:{...R4_QA,source:'production'}},{budget:{...verified.budget,workerRequestsToday:90001}},{d1Budget:{rowsRead:100,rowsWritten:90000}}])assert.throws(()=>assertR4ScopedBudget({...verified,...bad}));
});

test('scoped seed worker is a standalone no-Images no-product-config isolated harness',()=>{
 const base={origin,sourceId:expected[0],restoreId:expected[1],clientIds};
 const config=r4ScopedRecoveryWorkerConfig(base);
 assert.equal(config.main,'../scripts/private-recovery-worker.ts');
 assert.equal(config.vars.QA_RECOVERY_SEED_MODE,'true');
 assert.equal(config.vars.QA_RECOVERY_CLIENT_IDS,clientIds.join(','));
 assert.deepEqual(config.d1_databases.map(x=>x.database_id),expected);
 assert.equal(config.images,undefined);
 assert.equal(config.services,undefined);
 assert.deepEqual(config.routes,[]);
 assert.deepEqual(config.triggers.crons,[]);
 assert.equal(config.vars.CLIENT_AUTH_MODE,undefined);
 assert.equal(config.vars.CLIENT_PASSWORD_BACKEND,undefined);
});

test('synthetic manifest preallocates exactly 2 independent owners, 10 unique 79B PNG images, 10 intents and 2 favorites',()=>{
 let counter=0;
 const ids=Array.from({length:24},()=>{counter++;return '00000000-0000-4000-8000-'+counter.toString(16).padStart(12,'0')});
 const receipt=createScopedFixtureReceipt(()=>ids.shift());
 assert.equal(validateScopedFixtureReceipt(receipt),true);
 assert.deepEqual(receipt.clients.map(c=>c.email),receipt.clients.map(c=>'pilot-'+c.id+'@example.invalid'));
 assert.equal(receipt.clients.length,2);
 assert.equal(receipt.galleries.length,2);
 assert.equal(receipt.images.length,10);
 assert.equal(receipt.intents.length,10);
 assert.equal(receipt.favorites.length,2);
 assert.equal(new Set(receipt.images.map(x=>x.storageKey)).size,10);
 assert.ok(receipt.images.every(x=>x.sizeBytes===79 && x.mimeType==='image/png'));
 assert.throws(()=>validateScopedFixtureReceipt({...receipt,clients:[receipt.clients[0],receipt.clients[0]]}));
 assert.throws(()=>validateScopedFixtureReceipt({...receipt,images:[...receipt.images.slice(0,9),{...receipt.images[9],storageKey:receipt.images[0].storageKey}]}));
});
