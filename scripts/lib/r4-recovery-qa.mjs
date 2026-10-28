// Dedicated interrupted R4 allocation only. This module performs no I/O.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { R4_QA, R4_RESUME_DATABASES } from './r4-edge-qa.mjs';

const ACCOUNT = '257bca437616da74ece1ce4bbaf0bd89';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertR4RecoveryScope({ origin, sourceId, restoreId, clientIds }) {
  assert.equal(sourceId, R4_RESUME_DATABASES[0].id, 'R4 source D1 ID must equal interrupted run receipt');
  assert.equal(restoreId, R4_RESUME_DATABASES[1].id, 'R4 restored D1 ID must equal interrupted run receipt');
  const url = new URL(origin);
  assert.equal(url.origin, origin, 'Dedicated origin required');
  assert.equal(url.protocol, 'https:');
  assert.ok(url.hostname.startsWith(R4_QA.worker + '.') && /^[a-z0-9-]+\.workers\.dev$/.test(url.hostname.slice(R4_QA.worker.length + 1)), 'Dedicated R4 QA Worker required');
  assert.ok(Array.isArray(clientIds) && clientIds.length === 2 && new Set(clientIds).size === 2 && clientIds.every(id => UUID.test(id)), 'Exactly two unique synthetic client IDs required');
  return true;
}

export function r4RecoveryWorkerConfig(input) {
  assertR4RecoveryScope(input);
  return {
    name: R4_QA.worker,
    account_id: ACCOUNT,
    main: '../scripts/private-recovery-worker.ts',
    compatibility_date: '2026-05-22',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: true,
    preview_urls: false,
    routes: [],
    triggers: { crons: [] },
    vars: {
      ENVIRONMENT: 'preview',
      QA_RECOVERY_ENABLED: 'true',
      QA_RECOVERY_ALLOCATION: 'r4-20261028',
      SITE_ORIGIN: input.origin,
      QA_RECOVERY_CLIENT_IDS: input.clientIds.join(','),
    },
    d1_databases: [
      { binding: 'SOURCE_DB', database_name: R4_QA.source, database_id: input.sourceId },
      { binding: 'RESTORE_DB', database_name: R4_QA.restore, database_id: input.restoreId },
    ],
    r2_buckets: [
      { binding: 'SOURCE_ORIGINALS', bucket_name: R4_QA.originals },
      { binding: 'RESTORE_ORIGINALS', bucket_name: R4_QA.restored },
      { binding: 'BACKUPS', bucket_name: R4_QA.backups },
    ],
  };
}

export function signR4QaAdminCookie({ secret, passwordHash, now = Math.floor(Date.now()/1000) }) {
  assert.ok(typeof secret === 'string' && secret.length >= 20 && /^[a-f0-9]{64}$/.test(passwordHash), 'QA admin signing materials required');
  const body = Buffer.from(JSON.stringify({ email:'qa@punctum.invalid', exp:now+3600 })).toString('base64url');
  const mac = createHmac('sha256', secret + '\\0env:' + passwordHash).update(body).digest('base64url');
  return body + '.' + mac;
}

export function signR4QaClientCookie({ clientId, sessionVersion, secret, now = Math.floor(Date.now()/1000) }) {
  assert.ok(UUID.test(clientId) && Number.isSafeInteger(sessionVersion) && sessionVersion >= 1 && typeof secret === 'string' && secret.length >= 16, 'Synthetic QA session inputs required');
  const body = Buffer.from(JSON.stringify({sub:clientId,version:sessionVersion,iat:now,exp:now+3600,audience:'punctum-client-access'})).toString('base64url');
  return body + '.' + createHmac('sha256',secret).update(body).digest('base64url');
}

export function assertR4RecoveryPreflight(report) {
  assert.equal(report.resume,true,'Recovery requires resumed interrupted QA, no new allocations');
  assert.equal(report.stage,'performance-complete','Candidate performance and rollback must finish first');
  assert.equal(report.functionalQa,'NOT_RUN','Recovery must not replay');
  assert.ok(Array.isArray(report.created?.databases) && report.created.databases.length===2, 'Both D1 receipts required');
  assert.deepEqual(report.created.buckets,[R4_QA.originals,R4_QA.restored,R4_QA.backups],'Only the interrupted R4 private R2 buckets are allowed');
  for(let i=0;i<2;i++) assert.deepEqual(report.created.databases[i],R4_RESUME_DATABASES[i]);
  assert.ok(Array.isArray(report.performance) && report.performance.length===2 && report.performance.every(p=>p.errors===0 && p.versionMismatches===0),'Current baseline/candidate must be error-free');
  assert.deepEqual(report.performance.map(p=>p.label),['baseline','candidate'],'Baseline then candidate performance required');
  assert.equal(report.rollback?.status,200,'Isolated Worker rollback must have succeeded');
  assert.ok(report.rollback?.restoredCandidate?.versionId,'Candidate must be reinstalled after rollback');
  assertR4RecoveryScope({origin:report.origin,sourceId:report.created.databases[0].id,restoreId:report.created.databases[1].id,clientIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']});
  return true;
}

export function assertR4RecoveryVacant({source,restore,objects}) {
  for (const role of [source,restore]) {
    for (const table of ['client_accounts','client_galleries','client_gallery_images','client_gallery_upload_intents','client_gallery_favorites']) {
      assert.equal(role?.[table],0,'All R4 client tables must be proven empty before recovery');
    }
  }
  for (const bucket of ['originals','restored','backups'])
    assert.equal(objects?.[bucket],0,'Every dedicated R4 R2 bucket must be proven empty before recovery');
  return true;
}
