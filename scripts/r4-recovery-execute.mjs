// Invoked only after R4 resumed edge performance and rollback. No production or historical bindings.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { R4_QA, R4_RESUME_DATABASES, isolatedQaConfig } from './lib/r4-edge-qa.mjs';
import { assertPrivateBucketPrivacy, d1QueryRows, r2RestListing } from './lib/private-preview.mjs';
import { assertR4RecoveryPreflight, assertR4RecoveryVacant, assertR4RecoveryScope, r4RecoveryWorkerConfig, signR4QaAdminCookie, signR4QaClientCookie } from './lib/r4-recovery-qa.mjs';

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
      encoding:'utf8',input,maxBuffer:8*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false'}
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
    const listing=r2RestListing(await api(base+'/r2/buckets/'+name+'/objects?per_page=1'));
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
  report.recovery={status:'PREFLIGHT_VACANT',synthetic:true,accessProviderTested:false,originalSourceRun:'40756797747',sourceId:source,restoreId:restore};
  await checkpoint();

  // This Worker has ONLY the fresh QA D1/R2 bindings; no inherited site routes or external services.
  const built=JSON.parse(await readFile(resolve('dist/server/wrangler.json'),'utf8'));
  const appConfig=isolatedQaConfig(built,{
    databaseId:source,createdDatabaseIds:[source,restore],origin,privateEnabled:true,performanceOnly:false
  });
  const appPath=resolve('dist/server/r4-functional-qa.wrangler.json');
  await writeFile(appPath,JSON.stringify(appConfig));
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
  let reachable=false;
  for(let i=0;i<20;i++) {
    const response=await fetch(origin+'/admin/api/clientes',{headers:{Cookie:adminCookie},redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(response.status===200){reachable=true;break;}
    if(response.status!==401 && response.status!==403 && response.status!==404 && response.status!==503) throw new Error('QA admin probe HTTP '+response.status);
    await pause(1000);
  }
  assert.ok(reachable,'QA admin session did not propagate');
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
    body:JSON.stringify({clientIds:ids}),signal:AbortSignal.timeout(120000)});
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
}
