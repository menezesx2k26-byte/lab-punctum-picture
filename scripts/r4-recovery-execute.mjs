// Invoked only after R4 resumed edge performance and rollback. No production or historical bindings.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { R4_QA, R4_RESUME_DATABASES, isolatedQaConfig } from './lib/r4-edge-qa.mjs';
import { assertPrivateBucketPrivacy, d1QueryRows } from './lib/private-preview.mjs';
import { assertR4RecoveryPreflight, assertR4RecoveryVacant, assertR4RecoveryScope, assertR4FlagDisabledCandidateConfig, withR4QaRestoration, r4RecoveryWorkerConfig, signR4QaAdminCookie, signR4QaClientCookie, r4VacancyListing } from './lib/r4-recovery-qa.mjs';
import { assertR4ScopedExisting, assertR4ScopedBudget, r4ScopedRecoveryWorkerConfig, r4ObservedOneListing, R4_FAILED_OWNER, inspectR4ReadyVersion } from './lib/r4-recovery-qa.mjs';
import { createScopedFixtureReceipt } from './lib/r4-scoped-fixture.mjs';
import { assertResumeQaInventory } from './lib/r4-edge-qa.mjs';

const account = '257bca437616da74ece1ce4bbaf0bd89';
const tables = ['client_accounts','client_galleries','client_gallery_images','client_gallery_upload_intents','client_gallery_favorites'];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg==','base64');
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));

export async function runR4RecoveryQa(report, api) {
  assert.equal(process.env.GITHUB_ACTIONS,'true','Remote recovery only in masked Actions');
  assert.equal(process.env.R4_EDGE_QA_RESUME,'true','Only interrupted allocation may be resumed');
  assert.equal(process.env.R4_EDGE_QA_RECOVERY,'true','Separate explicit recovery opt-in required');
  assertR4RecoveryPreflight({...report,resume:true});
  const origin = report.origin, [source,restore] = R4_RESUME_DATABASES.map(r=>r.id);
  const base = '/accounts/'+account;
  const requireApi = async (path,body,method) => {
    const result = await api(path,body,method);
    assert.equal(result?.success,true,'Cloudflare QA operation failed');
    return result.result;
  };
  const query = async (id,sql,params=[]) => {
    assert.ok([source,restore].includes(id),'Queried D1 must match isolated receipt');
    return d1QueryRows(await requireApi(base+'/d1/database/'+id+'/query',{sql,params}));
  };
  const checkpoint = async () => writeFile('outputs/r4-edge-qa-report.json',JSON.stringify(report,null,2));
  const wrangler = (args,input) => {
    const result=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args],{
      encoding:'utf8',input,maxBuffer:8*1024*1024,timeout:60000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}
    });
    if(result.status!==0) throw new Error('R4 QA Wrangler '+args[0]+' failed; inspect masked Actions logs');
    report.writes++;
  };
  // Validate the EXACT allocated D1/R2 inventory again; do not touch occupied pilot resources.
  assert.equal(report.created?.databases?.[0]?.id,source);
  assert.equal(report.created?.databases?.[1]?.id,restore);
  const objects={};
  for(const [role,name] of [['originals',R4_QA.originals],['restored',R4_QA.restored],['backups',R4_QA.backups]]) {
    assertPrivateBucketPrivacy(
      await requireApi(base+'/r2/buckets/'+name+'/domains/managed'),
      await requireApi(base+'/r2/buckets/'+name+'/domains/custom')
    );
    const listing=r4VacancyListing(await api(base+'/r2/buckets/'+name+'/objects?per_page=1'));
    assert.equal(listing.truncated,false,'Entire QA bucket vacancy must be verifiable');
    objects[role]=listing.objects.length;
  }
  const counts={};
  for(const [role,id] of [['source',source],['restore',restore]]) {
    const values={};
    for(const table of tables) {
      const rows=await query(id,'SELECT COUNT(*) AS count FROM '+table);
      assert.ok(rows.length===1 && Number.isSafeInteger(rows[0].count),'QA table count not verifiable');
      values[table]=rows[0].count;
    }
    counts[role]=values;
  }
  assertR4RecoveryVacant({...counts,objects});
  for(const id of [source,restore]) {
    const adminRows=await query(id,'SELECT COUNT(*) AS count FROM admin_credentials WHERE id=1');
    assert.equal(adminRows[0]?.count,0,'Current QA admin HMAC must use the env credential revision');
  }
  report.recovery={status:'PREFLIGHT_VACANT',synthetic:true,accessProviderTested:false,originalSourceRun:'40756797747',sourceId:source,restoreId:restore,
    remainingResources:{source:{databaseId:source},restore:{databaseId:restore},worker:R4_QA.worker,
      buckets:[R4_QA.originals,R4_QA.restored,R4_QA.backups],preserved:true,deleted:false,
      inventory:'IDs/names verified in preflight; post-run D1 counts pending'}};
  await checkpoint();

  // This Worker has ONLY the fresh QA D1/R2 bindings; no inherited site routes or external services.
  const built=JSON.parse(await readFile(resolve('dist/server/wrangler.json'),'utf8'));
  // Prepared by the earlier measured candidate deployment, strictly flag-disabled.
  const candidatePath=resolve('dist/server/r4-qa.wrangler.json');
  const candidateConfig=JSON.parse(await readFile(candidatePath,'utf8'));
  assertR4FlagDisabledCandidateConfig(candidateConfig,origin);
  const appConfig=isolatedQaConfig(built,{
    databaseId:source,createdDatabaseIds:[source,restore],origin,privateEnabled:true,performanceOnly:false
  });
  assert.equal(appConfig.images?.binding,'IMAGES','Upload-based recovery QA needs the IMAGES binding and verified transformation allowance before creating fixtures; do not bypass image validation');
  const appPath=resolve('dist/server/r4-functional-qa.wrangler.json');
  await writeFile(appPath,JSON.stringify(appConfig));
  await withR4QaRestoration(report,async()=>{
  report.recovery.status='SOURCE_APP_DEPLOYING'; await checkpoint();
  wrangler(['deploy','--config',appPath]);
  const adminSecret=randomBytes(32).toString('base64url');
  const clientSecret=randomBytes(32).toString('base64url');
  const passwordHash=createHash('sha256').update(randomBytes(32)).digest('hex');
  const adminCookie='punctum_admin_session='+signR4QaAdminCookie({secret:adminSecret,passwordHash});
  for(const value of [adminSecret,clientSecret,passwordHash,adminCookie]) console.log('::add-mask::'+value);
  wrangler(['secret','bulk','--config',appPath],JSON.stringify({
    ADMIN_SESSION_SECRET:adminSecret, ADMIN_PASSWORD_HASH:passwordHash, CLIENT_SESSION_SECRET:clientSecret
  }));
  const send = async (path,method='GET',body,session=adminCookie,expected=200) => {
    assert.ok(path.startsWith('/') && !path.startsWith('//'),'Only same-origin private QA requests');
    const response=await fetch(origin+path,{method,redirect:'manual',
      headers:{Origin:origin,...(session?{Cookie:session}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
    if(response.status!==expected) throw new Error('QA '+method+' '+path+' HTTP '+response.status+', expected '+expected);
    return response;
  };
  // No private API failure is retried or mistaken for harmless SSR noise.
  const probe=await fetch(origin+'/admin/api/clientes',{headers:{Cookie:adminCookie},redirect:'manual',signal:AbortSignal.timeout(20000)});
  assert.equal(probe.status,200,'QA private admin probe failed (not a public SSR failure)');
  const fixtures=[];
  for(let customer=0;customer<2;customer++) {
    const email='pilot-'+randomUUID()+'@example.invalid';
    const registered=await (await send('/admin/api/clientes','POST',{name:'R4 QA fictício '+customer,email},adminCookie,201)).json();
    assert.ok(registered.client?.id && registered.authMode==='access' && registered.temporaryPassword===undefined,'Access-only synthetic QA identity required');
    const clientId=registered.client.id;
    const galleryResponse=await (await send('/admin/api/albuns-privados','POST',{title:'R4 QA galeria '+customer,clientId,theme:'ivory'},adminCookie,201)).json();
    const galleryId=galleryResponse.gallery?.id;
    assert.ok(galleryId,'QA gallery ID required');
    const images=[];
    for(let item=0;item<5;item++) {
      const prefix='/admin/api/albuns-privados/'+galleryId;
      const intent=await (await send(prefix+'/uploads/intents','POST',{filename:'r4-fixture-'+item+'.png',mimeType:'image/png',sizeBytes:png.length},adminCookie,201)).json();
      const url=new URL(intent.uploadUrl);
      assert.equal(url.origin,origin,'Upload URL must remain inside isolated QA Worker');
      assert.equal(url.pathname,prefix+'/uploads/'+intent.intentId+'/direct');
      const uploaded=await fetch(url,{method:'PUT',headers:{...intent.requiredHeaders,Origin:origin,Cookie:adminCookie,'Content-Length':String(png.length)},body:png,redirect:'manual',signal:AbortSignal.timeout(20000)});
      assert.equal(uploaded.status,200,'QA synthetic upload failed');
      await send(prefix+'/uploads/'+intent.intentId+'/complete','POST');
      images.push(intent.imageId);
    }
    const prefix='/admin/api/albuns-privados/'+galleryId;
    await send(prefix+'/cover','PUT',{imageId:images[0]});
    await send(prefix+'/publish','POST');
    await send(prefix,'PATCH',{allowDownloads:true});
    const session='punctum_client_session='+signR4QaClientCookie({clientId,sessionVersion:1,secret:clientSecret});
    console.log('::add-mask::'+session);
    const own=await (await send('/api/client/galleries/'+galleryId,'GET',undefined,session)).json();
    assert.equal(own.gallery.images.length,5,'All synthetic images must be visible to owner');
    await send('/api/client/galleries/'+galleryId+'/favorites/'+images[0],'PUT',undefined,session);
    for(const imageId of images) {
      const bytes=Buffer.from(await (await send('/api/client/galleries/'+galleryId+'/images/'+imageId+'/download','GET',undefined,session)).arrayBuffer());
      assert.deepEqual(bytes,png,'Own original image bytes changed');
    }
    fixtures.push({clientId,galleryId,images,session});
    report.recovery.syntheticClientsCreated=fixtures.length;
    await checkpoint();
  }
  for(const first of fixtures) for(const second of fixtures) if(first!==second) {
    const denied=await send('/api/client/galleries/'+second.galleryId+'/images/'+second.images[0]+'/download','GET',undefined,first.session,404);
    assert.doesNotMatch(denied.headers.get('content-type')??'',/^image\//i,'Denied response served image media');
    assert.notDeepEqual(Buffer.from(await denied.arrayBuffer()),png,'Cross-tenant denial leaked original bytes');
  }
  report.recovery.status='SOURCE_QA_SYNTHETIC_2_CLIENTS_10_IMAGES';
  report.recovery.clientCount=2;report.recovery.galleryCount=2;report.recovery.imageCount=10;
  await checkpoint();

  // Transfer only via standalone scoped QA Worker and its authenticated, hash-checked backup.
  const ids=fixtures.map(f=>f.clientId);
  assertR4RecoveryScope({origin,sourceId:source,restoreId:restore,clientIds:ids});
  const recoveryConfig=r4RecoveryWorkerConfig({origin,sourceId:source,restoreId:restore,clientIds:ids});
  const recoveryPath=resolve('outputs/r4-recovery-worker.wrangler.json');
  await writeFile(recoveryPath,JSON.stringify(recoveryConfig));
  wrangler(['deploy','--config',recoveryPath]);
  const recoverySecret=randomBytes(32).toString('base64url');
  console.log('::add-mask::'+recoverySecret);
  wrangler(['secret','bulk','--config',recoveryPath],JSON.stringify({QA_RECOVERY_SECRET:recoverySecret}));
  report.recovery.status='RECOVERY_WORKER_DEPLOYED'; await checkpoint();
  // An ambiguous HTTP response is terminal; never auto-replay a possibly committed restoration.
  const response=await fetch(origin+'/qa/recover',{method:'POST',redirect:'manual',
    headers:{Origin:origin,Authorization:'Bearer '+recoverySecret,'Content-Type':'application/json'},
    body:JSON.stringify({clientIds:ids}),signal:AbortSignal.timeout(60000)});
  assert.equal(response.status,200,'Recovery failed or ambiguous: inspect D1/R2 state before any retry');
  const result=await response.json();
  assert.equal(result.backupVerified,true);
  assert.equal(result.accountsQuarantined,true);
  assert.equal(result.requiresSessionSecretRotation,true);
  assert.equal(result.objects,10);
  assert.equal(result.rows,26,'Expect two accounts, two galleries, ten images, ten upload intents, two favorites');
  assert.equal(result.hashes.length,10);
  // READ-ONLY validation of every restored relation and quarantine, with no UPSERT.
  for(const [table,expected] of [['client_accounts',2],['client_galleries',2],['client_gallery_images',10],['client_gallery_upload_intents',10],['client_gallery_favorites',2]]) {
    assert.equal((await query(restore,'SELECT COUNT(*) AS count FROM '+table))[0].count,expected,'Restored relational count mismatch');
  }
  assert.equal((await query(restore,'SELECT COUNT(*) AS count FROM client_accounts WHERE disabled_at IS NOT NULL AND session_version >= 2'))[0].count,2,'Restored accounts not quarantined or versioned');
  assert.equal((await query(restore,'PRAGMA foreign_key_check')).length,0,'Restored foreign keys invalid');
  // Rotate the destination cookie secret before serving any restored client.
  const restoredConfig=isolatedQaConfig(built,{databaseId:restore,createdDatabaseIds:[source,restore],origin,privateEnabled:true,performanceOnly:false,restored:true});
  const restoredPath=resolve('dist/server/r4-restored-qa.wrangler.json');
  await writeFile(restoredPath,JSON.stringify(restoredConfig));
  wrangler(['deploy','--config',restoredPath]);
  const rotatedSecret=randomBytes(32).toString('base64url');
  console.log('::add-mask::'+rotatedSecret);
  wrangler(['secret','bulk','--config',restoredPath],JSON.stringify({CLIENT_SESSION_SECRET:rotatedSecret}));
  for(const fixture of fixtures) {
    let denied=false;
    for(let i=0;i<15;i++){
      const check=await fetch(origin+'/api/client/me',{headers:{Cookie:fixture.session},redirect:'manual',signal:AbortSignal.timeout(15000)});
      if(check.status===401){denied=true;break;}
      if(check.status!==200) throw new Error('Unexpected restored-session response');
      await pause(1000);
    }
    assert.ok(denied,'Old QA client session remains authorized after restore');
  }
  report.recovery={...report.recovery,status:'RESTORE_QA_VERIFIED_QUARANTINED',backupHash:result.backupHash,objectHashes:result.hashes,restoredRows:result.rows,
    restoredObjects:result.objects,sessionSecretRotated:true,oldSessionsRejected:true,foreignKeysValid:true,
    rollbackInspection:'Prior isolated Worker baseline rollback already verified; recovered D1/R2 retained and accounts disabled; no destructive rollback executed.',
    accessProviderTested:false,realOtpVerified:false,productionTouched:false};
  report.functionalQa='QA_SYNTHETIC_RECOVERY_VERIFIED';report.accessOtp='NOT_RUN';
  await checkpoint();
  },async()=>{
    // Always return the exact candidate, with private feature flag false and no R2 bindings.
    // Neither D1 nor any bucket/object is deleted or reset. This is NOT a data rollback.
    report.recovery.candidateRestoration='RESTORING_FLAG_DISABLED';
    await checkpoint();
    assertR4FlagDisabledCandidateConfig(JSON.parse(await readFile(candidatePath,'utf8')),origin);
    wrangler(['deploy','--config',candidatePath]);
    const deployments=await requireApi(base+'/workers/scripts/'+R4_QA.worker+'/deployments');
    const current=deployments?.deployments?.[0];
    assert.ok(current?.versions?.length===1 && typeof current.versions[0].version_id==='string','Single deployed candidate version required');
    const currentId=current.versions[0].version_id;
    let versionObserved=false;
    for(let i=0;i<12;i++) {
      const response=await fetch(origin+'/robots.txt',{redirect:'manual',signal:AbortSignal.timeout(15000)});
      await response.arrayBuffer();
      if(response.headers.get('X-QA-Version')===currentId){versionObserved=true;break;}
      await pause(1000);
    }
    assert.ok(versionObserved,'Flag-disabled candidate version did not propagate');
    const existing={};
    for(const [role,id] of [['source',source],['restore',restore]]) {
      const accounts=await query(id,'SELECT COUNT(*) AS count FROM client_accounts');
      existing[role]={databaseId:id,clientAccounts:accounts[0]?.count};
    }
    report.recovery.remainingResources={
      ...existing,worker:R4_QA.worker,candidateVersionId:currentId,
      buckets:[R4_QA.originals,R4_QA.restored,R4_QA.backups],
      preserved:true,deleted:false,inventory:'D1 client counts re-read; R2 buckets retained without cleanup',
    };
  },checkpoint);
}

/**
 * Explicitly opted-in G18 path. Seed TWO synthetic clients directly into the
 * isolated source as a BACKUP fixture, never via the product upload pipeline.
 * Keep the one failed original case intact; no Images API is called.
 * Uses the existing scoped private-recovery-worker capture/restore implementation.
 */
export async function runR4ScopedRecoveryQa(report, api) {
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  assert.equal(process.env.R4_RECOVERY_SCOPED_EXECUTE,'true');
  assert.equal(process.env.R4_EDGE_QA_EXECUTE,'false','No parallel performance/recovery execution');
  assert.equal(process.env.R4_EDGE_QA_RECOVERY,'false','Legacy empty-source recovery prohibited');
  const base='/accounts/'+account;
  const requireApi=async(path,body,method)=>{
    const result=await api(path,body,method);
    assert.equal(result?.success,true,'Scoped QA provider failed: inspect without replay');
    return result.result;
  };
  const query=async(id,sql,params=[])=>{
    assert.ok(R4_RESUME_DATABASES.some(x=>x.id===id),'Only fixed R4 D1 IDs');
    return d1QueryRows(await requireApi(base+'/d1/database/'+id+'/query',{sql,params}));
  };
  const origin=`https://${R4_QA.worker}.${report.subdomain}.workers.dev`;
  const [source,restore]=R4_RESUME_DATABASES.map(x=>x.id);
  const assertOwnOrigin=()=>assertR4RecoveryScope({origin,sourceId:source,restoreId:restore,clientIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']});
  assertOwnOrigin();
  assertResumeQaInventory({databases:report.databaseInventory,buckets:report.bucketInventory,workers:report.workerInventory});
  const sum=(rows,key)=>rows.reduce((n,r)=>n+Number(r.sum?.[key]??0),0);
  for(const key of ['r2Storage','r2Operations','workerUsage','d1Usage'])
    assert.equal(report[key]?.accessible,true,'Fresh read-only quota evidence required');
  const r2Rows=report.r2Storage.data.r2StorageAdaptiveGroups;
  const operations=report.r2Operations.data.r2OperationsAdaptiveGroups;
  const workerRows=report.workerUsage.data.workersInvocationsAdaptive;
  const d1Rows=report.d1Usage.data.d1AnalyticsAdaptiveGroups;
  for(const rows of [r2Rows,operations,workerRows,d1Rows])
    assert.ok(Array.isArray(rows)&&rows.length<1000,'Complete bounded usage required');
  assert.ok(d1Rows.every(x=>['rowsRead','rowsWritten'].every(k=>Number.isSafeInteger(x.sum?.[k])&&x.sum[k]>=0)));
  report.resources=R4_QA;
  report.created={databases:R4_RESUME_DATABASES.map(d=>({...d})),buckets:[R4_QA.originals,R4_QA.restored,R4_QA.backups]};
  report.budget={
    databaseCount:report.databaseInventory.length,
    workerRequestsToday:sum(workerRows,'requests'),
    r2:{maximumStorageBytes:r2Rows.reduce((n,r)=>n+Number(r.max?.payloadSize??0),0),classARequests:sum(operations,'requests'),classBRequests:sum(operations,'requests')},
    subscriptions:report.subscriptions,
    namesInUse:[...report.databaseInventory,...report.bucketInventory,...report.workerInventory].map(x=>x.name)
  };
  report.d1Budget={rowsRead:sum(d1Rows,'rowsRead'),rowsWritten:sum(d1Rows,'rowsWritten')};
  assertR4ScopedBudget(report);
  const counts={},objects={};
  for(const [role,id] of [['source',source],['restore',restore]]){
    counts[role]={};
    for(const table of tables){
      const rows=await query(id,'SELECT COUNT(*) AS count FROM '+table);
      assert.ok(rows.length===1&&Number.isSafeInteger(rows[0].count));
      counts[role][table]=rows[0].count;
    }
  }
  for(const [role,name] of [['originals',R4_QA.originals],['restored',R4_QA.restored],['backups',R4_QA.backups]]){
    assertPrivateBucketPrivacy(await requireApi(base+'/r2/buckets/'+name+'/domains/managed'),await requireApi(base+'/r2/buckets/'+name+'/domains/custom'));
    const envelope=await api(base+'/r2/buckets/'+name+'/objects?per_page=100');
    if(role==='originals')objects[role]=r4ObservedOneListing(envelope);
    else {
      const listing=r4VacancyListing(envelope);
      assert.equal(listing.truncated,false);
      objects[role]=listing.objects.length;
    }
  }
  assertR4ScopedExisting({...counts,objects});
  // Preallocate and DURABLY record all 24 UUIDs before any remote write.
  const fixture=createScopedFixtureReceipt(randomUUID);
  const ids=fixture.clients.map(c=>c.id);
  assertR4RecoveryScope({origin,sourceId:source,restoreId:restore,clientIds:ids});
  report.recovery={status:'SCOPED_FIXTURE_RECEIPT_BEFORE_WRITES',synthetic:true,uploadE2E:false,
    fixture,sourceId:source,restoreId:restore,originalCase:R4_FAILED_OWNER,
    writesStarted:false,originalSourceRun:'40768574085',
    functionalGate:'G18_ONLY',g05:'NOT_RUN',g07:'NOT_RUN',g23:'PARTIAL_NOT_DATA_ROLLBACK'};
  const checkpoint=()=>writeFile('outputs/r4-scoped-recovery-report.json',JSON.stringify(report,null,2));
  await checkpoint();
  const wrangler=(args,input)=>{
    const out=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args],{
      input,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,
      env:{...process.env,WRANGLER_SEND_METRICS:'false'}
    });
    if(out.status!==0)throw Error('Scoped QA Wrangler failed: inspect remote state, never replay');
    report.writes=(report.writes??0)+1;
  };
  const built=JSON.parse(await readFile(resolve('dist/server/wrangler.json'),'utf8'));
  // Candidate restorer always has PRIVATE_GALLERIES_ENABLED=false and NO R2.
  const candidate=isolatedQaConfig(built,{databaseId:source,createdDatabaseIds:[source,restore],origin,performanceOnly:true});
  candidate.version_metadata={binding:'QA_VERSION'};
  candidate.main='r4-version-wrapper.mjs';
  const wrapper=`import worker from './index.js';\nexport default {async fetch(request,env,ctx){const r=await worker.fetch(request,env,ctx);const h=new Headers(r.headers);h.set('X-QA-Version',env.QA_VERSION.id);return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});}};\n`;
  await writeFile('dist/server/r4-version-wrapper.mjs',wrapper);
  assertR4FlagDisabledCandidateConfig(candidate,origin);
  const candidatePath=resolve('dist/server/r4-scoped-candidate.wrangler.json');
  await writeFile(candidatePath,JSON.stringify(candidate));
  const request=async(path,{method='GET',body,cookie,secret,expected=200}={})=>{
    const res=await fetch(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(60000),
      headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(secret?{Authorization:'Bearer '+secret}:{}),...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    if(res.status!==expected)throw Error('Scoped QA HTTP '+res.status+' on '+path+'; stop without replay');
    return res;
  };
  const recoveryConfig=r4ScopedRecoveryWorkerConfig({origin,sourceId:source,restoreId:restore,clientIds:ids});
  const recoveryPath=resolve('outputs/r4-scoped-recovery.wrangler.json');
  await writeFile(recoveryPath,JSON.stringify(recoveryConfig));
  await withR4QaRestoration(report,async()=>{
    report.recovery.writesStarted=true;report.recovery.status='SCOPED_RECOVERY_WORKER_DEPLOYING';await checkpoint();
    wrangler(['deploy','--config',recoveryPath]);
    const secret=randomBytes(32).toString('base64url');
    console.log('::add-mask::'+secret);
    wrangler(['secret','bulk','--config',recoveryPath],JSON.stringify({QA_RECOVERY_SECRET:secret}));
    const inspect=async()=>{
      const deployed=await requireApi(base+'/workers/scripts/'+R4_QA.worker+'/deployments');
      const versionId=deployed?.deployments?.[0]?.versions?.[0]?.version_id;
      report.recovery.inspectorObservations??=[];
      return inspectR4ReadyVersion({origin,secret,versionId,pause,observations:report.recovery.inspectorObservations});
    };
    const before=await inspect();
    assertR4ScopedExisting({source:before.source,restore:before.restore,
      objects:{originals:before.sourceObjects.count,restored:before.restoredObjects.count,backups:before.backupObjects.count}});
    assert.equal(before.sourceObjects.keys[0],before.legacyObjectKey);
    report.recovery.legacyBefore={rowsSha256:before.legacyRowsSha256,objectSha256:before.legacyObjectSha256,key:before.legacyObjectKey};
    report.recovery.status='LEGACY_HASHED_BEFORE_SEED';await checkpoint();
    const seeded=await(await request('/qa/seed',{method:'POST',body:fixture,secret,expected:201})).json();
    assert.equal(seeded.stage,'QA_BACKUP_FIXTURE_SEEDED_NOT_UPLOAD_E2E');
    assert.equal(seeded.createdRows,26);assert.equal(seeded.createdObjects,10);
    report.recovery.seedReceipt={createdRows:26,createdObjects:10,sha256:seeded.sha256};
    report.recovery.status='SYNTHETIC_SOURCE_SEEDED';await checkpoint();
    // Use same app runtime for ownership/A-B proof. Never call /uploads/intents or Images.
    const app=isolatedQaConfig(built,{databaseId:source,createdDatabaseIds:[source,restore],origin,privateEnabled:true,performanceOnly:false});
    assert.equal(app.images,undefined,'No image service activation');
    const appPath=resolve('dist/server/r4-scoped-app.wrangler.json');await writeFile(appPath,JSON.stringify(app));
    wrangler(['deploy','--config',appPath]);
    const sessionSecret=randomBytes(32).toString('base64url');
    console.log('::add-mask::'+sessionSecret);
    wrangler(['secret','bulk','--config',appPath],JSON.stringify({CLIENT_SESSION_SECRET:sessionSecret}));
    const sessions=fixture.clients.map(c=>'punctum_client_session='+signR4QaClientCookie({clientId:c.id,sessionVersion:1,secret:sessionSecret}));
    let sourceReady=false;
    for(let i=0;i<15;i++){
      const check=await fetch(origin+'/api/client/me',{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Cookie:sessions[0]}});
      if(check.status===200){sourceReady=true;break;}
      if(![401,404,503].includes(check.status))throw Error('Unexpected source app readiness HTTP '+check.status);
      await pause(1000);
    }
    assert.equal(sourceReady,true,'Source app synthetic session did not propagate');
    for(let index=0;index<2;index++){
      const gallery=fixture.galleries[index],cookie=sessions[index];
      const own=await(await request('/api/client/galleries/'+gallery.id,{cookie})).json();
      assert.equal(own.gallery.images.length,5,'Expected five synthetic gallery images');
      for(const image of fixture.images.filter(i=>i.galleryId===gallery.id)){
        const response=await request('/api/client/galleries/'+gallery.id+'/images/'+image.id+'/download',{cookie});
        const bytes=Buffer.from(await response.arrayBuffer());
        assert.deepEqual(bytes,png,'79-byte synthetic PNG mismatch');
      }
      const foreign=fixture.galleries[1-index];
      const denied=await request('/api/client/galleries/'+foreign.id,{cookie,expected:404});
      assert.doesNotMatch(denied.headers.get('Content-Type')??'',/^image\//);
    }
    report.recovery.sourceOwnershipAB='PASS';await checkpoint();
    // Reinstall standalone recovery worker and restore ONLY the two new IDs.
    wrangler(['deploy','--config',recoveryPath]);
    wrangler(['secret','bulk','--config',recoveryPath],JSON.stringify({QA_RECOVERY_SECRET:secret}));
    const beforeRecovery=await inspect();
    assert.equal(beforeRecovery.legacyRowsSha256,before.legacyRowsSha256);
    assert.equal(beforeRecovery.legacyObjectSha256,before.legacyObjectSha256);
    assert.equal(beforeRecovery.sourceObjects.count,11);
    const result=await(await request('/qa/recover',{method:'POST',body:{clientIds:ids},secret})).json();
    assert.equal(result.backupVerified,true);
    assert.equal(result.accountsQuarantined,true);assert.equal(result.requiresSessionSecretRotation,true);
    assert.equal(result.rows,26);assert.equal(result.objects,10);assert.equal(result.hashes.length,10);
    const after=await inspect();
    assert.equal(after.legacyRowsSha256,before.legacyRowsSha256);
    assert.equal(after.legacyObjectSha256,before.legacyObjectSha256);
    assert.deepEqual(after.restore,{client_accounts:2,client_galleries:2,client_gallery_images:10,client_gallery_upload_intents:10,client_gallery_favorites:2});
    assert.equal(after.restoredObjects.count,10);
    assert.equal(after.backupObjects.count,1);
    const foreignKeys=await query(restore,'PRAGMA foreign_key_check');assert.equal(foreignKeys.length,0);
    const quarantined=await query(restore,'SELECT COUNT(*) AS count FROM client_accounts WHERE disabled_at IS NOT NULL AND session_version >= 2');
    assert.equal(quarantined[0]?.count,2);
    report.recovery.status='SCOPED_RESTORE_HASHES_AND_26_ROWS_VERIFIED';
    report.recovery.backupHash=result.backupHash;
    report.recovery.objectHashes=result.hashes;
    report.recovery.legacyAfter={rowsSha256:after.legacyRowsSha256,objectSha256:after.legacyObjectSha256};
    await checkpoint();
    const restored=isolatedQaConfig(built,{databaseId:restore,createdDatabaseIds:[source,restore],origin,privateEnabled:true,performanceOnly:false,restored:true});
    assert.equal(restored.images,undefined);
    const restoredPath=resolve('dist/server/r4-scoped-restored.wrangler.json');await writeFile(restoredPath,JSON.stringify(restored));
    wrangler(['deploy','--config',restoredPath]);
    const rotatedSecret=randomBytes(32).toString('base64url');
    console.log('::add-mask::'+rotatedSecret);
    wrangler(['secret','bulk','--config',restoredPath],JSON.stringify({CLIENT_SESSION_SECRET:rotatedSecret}));
    for(const cookie of sessions){
      let denied=false;
      for(let i=0;i<15;i++){
        const check=await fetch(origin+'/api/client/me',{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Cookie:cookie}});
        if(check.status===401){denied=true;break;}
        if(![200,404,503].includes(check.status))throw Error('Unexpected restored-session HTTP '+check.status);
        await pause(1000);
      }
      assert.equal(denied,true,'Old signed client session must be denied after restore');
    }
    report.recovery.oldSessionsRejected=true;report.recovery.sessionSecretRotated=true;
    report.recovery.status='SCOPED_G18_LOCAL_PROOFS_COMPLETE_PENDING_CANDIDATE_RESTORE';
    report.functionalQa='QA_SYNTHETIC_G18_ONLY';await checkpoint();
  },async()=>{
    // Also runs after a partial PUT/batch/HTTP timeout: never delete or replay.
    report.recovery.candidateRestoration='RESTORING_FLAG_DISABLED';await checkpoint();
    assertR4FlagDisabledCandidateConfig(candidate,origin);
    wrangler(['deploy','--config',candidatePath]);
    const deployed=await requireApi(base+'/workers/scripts/'+R4_QA.worker+'/deployments');
    const versionId=deployed?.deployments?.[0]?.versions?.[0]?.version_id;
    assert.ok(typeof versionId==='string');
    let observed=false;
    for(let i=0;i<12;i++){
      const result=await fetch(origin+'/robots.txt',{redirect:'manual',signal:AbortSignal.timeout(15000)});
      await result.arrayBuffer();
      if(result.headers.get('X-QA-Version')===versionId){observed=true;break;}
      await pause(1000);
    }
    assert.equal(observed,true,'Flag-disabled Worker restoration must be observed');
    report.recovery.remainingResources={
      source:{id:source,accounts:(await query(source,'SELECT COUNT(*) AS n FROM client_accounts'))[0]?.n},
      restore:{id:restore,accounts:(await query(restore,'SELECT COUNT(*) AS n FROM client_accounts'))[0]?.n},
      worker:R4_QA.worker,versionId,buckets:[R4_QA.originals,R4_QA.restored,R4_QA.backups],
      flagDisabled:true,noR2:true,preserved:true,deleted:false
    };
  },checkpoint);
  if(report.recovery.candidateRestoration!=='RESTORED_FLAG_DISABLED')throw Error('Restoration not confirmed');
  report.recovery.status='SCOPED_G18_EXECUTED_REVIEW_EVIDENCE';
  report.recovery.g23='PARTIAL_NO_DATA_ROLLBACK';report.recovery.g07='NOT_RUN';report.recovery.g05='NOT_RUN';
  report.status='SCOPED_G18_EVIDENCE_COMPLETE_AWAITING_REVIEW';
  await checkpoint();
}
