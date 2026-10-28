import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import { R4_QA, R4_RESUME_DATABASES } from './lib/r4-edge-qa.mjs';
import {
  assertR4RecoveryScope, r4RecoveryWorkerConfig, signR4QaAdminCookie,
  signR4QaClientCookie, assertR4RecoveryPreflight, assertR4RecoveryVacant,
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
  assert.equal(mac,createHmac('sha256',secret+'\\0env:'+passwordHash).update(payload).digest('base64url'));
  assert.notEqual(mac,createHmac('sha256',secret).update(payload).digest('base64url'));
  const client=signR4QaClientCookie({clientId:clientIds[0],sessionVersion:1,secret:'fake-client-secret',now:1_700_000_000});
  const body=JSON.parse(Buffer.from(client.split('.')[0],'base64url').toString());
  assert.deepEqual({sub:body.sub,version:body.version,audience:body.audience},{sub:clientIds[0],version:1,audience:'punctum-client-access'});
});

test('recovery stage rejects incomplete performance, unexpected inventory, prior writes and reuse', () => {
  const base={resume:true,origin,databases:R4_RESUME_DATABASES.map(x=>({...x,uuid:x.id})),created:{databases:R4_RESUME_DATABASES,buckets:[R4_QA.originals,R4_QA.restored,R4_QA.backups]},performance:[{label:'baseline',errors:0,versionMismatches:0},{label:'candidate',errors:0,versionMismatches:0}],rollback:{status:200,restoredCandidate:{versionId:'candidate'}},stage:'performance-complete',functionalQa:'NOT_RUN'};
  assert.doesNotThrow(()=>assertR4RecoveryPreflight(base));
  for(const change of [
    {resume:false},{stage:'baseline-performance'},
    {performance:[{errors:1,versionMismatches:0}]},
    {rollback:null},{created:{databases:[R4_RESUME_DATABASES[0]]}},
    {created:{databases:R4_RESUME_DATABASES,buckets:[R4_QA.originals]}},
    {performance:[{label:'candidate',errors:0,versionMismatches:0},{label:'baseline',errors:0,versionMismatches:0}]},
    {functionalQa:'PASS'},
  ]) assert.throws(()=>assertR4RecoveryPreflight({...base,...change}));
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
