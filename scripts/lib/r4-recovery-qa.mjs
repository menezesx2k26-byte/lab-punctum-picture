// Dedicated interrupted R4 allocation only. This module performs no I/O.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { R4_QA, R4_RESUME_DATABASES, assertFreshQaBudget } from './r4-edge-qa.mjs';
import { r2RestListing } from './private-preview.mjs';

// Run 40768031299 observed this exact empty envelope on all three dedicated buckets.
// Cloudflare documents result_info as optional. Never infer vacancy for nonempty,
// malformed or cursor-bearing responses, and preserve the legacy strict parser.
export function r4VacancyListing(envelope) {
  if(envelope?.success===true && Array.isArray(envelope.result) && envelope.result.length===0 &&
    !Object.hasOwn(envelope,'result_info') && Array.isArray(envelope.errors) && envelope.errors.length===0 &&
    Array.isArray(envelope.messages) && envelope.messages.length===0) return {objects:[],truncated:false};
  return r2RestListing(envelope);
}
/** Provisional one-object inventory only; authenticated R2.list must confirm
 * exact cardinality and legacy hash before the seed's first write. */
export function r4ObservedOneListing(envelope) {
 if(envelope?.success===true && Array.isArray(envelope.result) &&
    envelope.result.length===1 && typeof envelope.result[0]?.key==='string' &&
    !Object.hasOwn(envelope,'result_info') &&
    Array.isArray(envelope.errors)&&envelope.errors.length===0 &&
    Array.isArray(envelope.messages)&&envelope.messages.length===0)
    return 1;
 const parsed=r2RestListing(envelope);
 assert.equal(parsed.truncated,false,'Complete legacy listing required');
 assert.equal(parsed.objects.length,1,'Exactly one pre-existing object required');
 return 1;
}

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
  // Mirrors worker/utils/auth.ts: actual NUL byte + credential revision, not slash-zero text.
  const mac = createHmac('sha256', secret + String.fromCharCode(0) + 'env:' + passwordHash).update(body).digest('base64url');
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
  assert.deepEqual(report.resources,R4_QA,'Only the exact known R4 resource allocation is authorized');
  for(const name of ['r2Storage','r2Operations','workerUsage','d1Usage'])
    assert.equal(report[name]?.accessible,true,'Current Cloudflare quota evidence is required: '+name);
  // The interrupted receipt already owns two free D1 slots. The original preflight
  // subtracts exactly those two adopted allocations from its new-slot budget.
  assert.ok(Number.isSafeInteger(report.budget?.databaseCount) &&
    report.budget.databaseCount>=2 && report.budget.databaseCount-2<=8 &&
    Number.isSafeInteger(report.budget?.workerRequestsToday) && report.budget.workerRequestsToday<=90_000,
    'Current free-tier capacity measurements required');
  assert.ok(Number.isSafeInteger(report.d1Budget?.rowsRead) && report.d1Budget.rowsRead<4_500_000 &&
    Number.isSafeInteger(report.d1Budget?.rowsWritten) && report.d1Budget.rowsWritten<90_000,
    'Current D1 free-tier headroom required');
  assert.ok(Array.isArray(report.created?.databases) && report.created.databases.length===2, 'Both D1 receipts required');
  assert.deepEqual(report.created.buckets,[R4_QA.originals,R4_QA.restored,R4_QA.backups],'Only the interrupted R4 private R2 buckets are allowed');
  for(let i=0;i<2;i++) assert.deepEqual(report.created.databases[i],R4_RESUME_DATABASES[i]);
  assert.ok(Array.isArray(report.performance) && report.performance.length===2,'Both current edge measurements required');
  assert.deepEqual(report.performance.map(p=>p.label),['baseline','candidate'],'Baseline then candidate performance required');
  // Public SSR can fail its CPU quota without invalidating an independent private D1/R2 gate.
  // Never allow 401/404/500, mixed versions, incomplete samples or hidden HTTP errors.
  let public503=0;
  for(const measurement of report.performance) {
    assert.equal(measurement.versionMismatches,0,'Edge version mismatch invalidates recovery');
    assert.ok(typeof measurement.versionId==='string' && measurement.versionId.length>0,'Observed version ID required');
    assert.ok(Array.isArray(measurement.samples) && measurement.samples.length===64,'64 public edge samples required');
    let failed=0;
    for(let i=0;i<measurement.samples.length;i++) {
      const sample=measurement.samples[i];
      assert.equal(sample.index,i,'Ordered edge sample receipt required');
      assert.ok(sample.status===200 || sample.status===503,'Only observed public SSR HTTP 503 may be decoupled from private QA');
      if(sample.status===503){failed++;public503++;}
      if(sample.status===200 || sample.actualVersionId!=null)
        assert.equal(sample.actualVersionId,measurement.versionId,'Public edge Worker version changed');
    }
    assert.equal(measurement.errors,failed,'Public HTTP failure count cannot be hidden');
    assert.ok(failed<64,'A wholly unresponsive public Worker is not safe enough for private recovery QA');
  }
  assert.equal(report.status,public503?'PERFORMANCE_QA_WITH_REQUEST_FAILURES':'PERFORMANCE_QA_EXECUTED','Keep current public performance failure state unchanged');
  assert.equal(report.rollback?.status,200,'Isolated Worker rollback must have succeeded');
  assert.ok(report.rollback?.restoredCandidate?.versionId,'Candidate must be reinstalled after rollback');
  assertR4RecoveryScope({origin:report.origin,sourceId:report.created.databases[0].id,restoreId:report.created.databases[1].id,clientIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']});
  return true;
}

export function assertR4FlagDisabledCandidateConfig(config,origin) {
  assert.ok(config && config.name===R4_QA.worker && config.main==='r4-version-wrapper.mjs','Exact candidate performance Worker required');
  assertR4RecoveryScope({origin,sourceId:R4_RESUME_DATABASES[0].id,restoreId:R4_RESUME_DATABASES[1].id,clientIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']});
  assert.equal(config.workers_dev,true);
  assert.deepEqual(config.routes,[]);
  assert.deepEqual(config.triggers?.crons,[]);
  assert.equal(config.vars?.ENVIRONMENT,'preview');
  assert.equal(config.vars?.SITE_ORIGIN,origin);
  assert.equal(config.vars?.PRIVATE_GALLERIES_ENABLED,'false');
  assert.equal(config.vars?.CLIENT_AUTH_MODE,'access');
  assert.equal(config.vars?.CLIENT_ACCESS_AUD,'r4-qa-access-unconfigured');
  assert.deepEqual(config.r2_buckets,[]);
  assert.deepEqual(config.d1_databases?.map(d=>[d.binding,d.database_id]),[['DB',R4_RESUME_DATABASES[0].id]]);
  return true;
}

/** Always restore flag-disabled QA even when the private harness fails. Never delete fixtures. */
export async function withR4QaRestoration(report,work,restore,checkpoint=async()=>{}) {
  let firstError;
  try {
    await work();
  } catch(error) {
    firstError=error;
    report.functionalQa='FAILED_PRIVATE_QA';
    report.recovery.failure=error instanceof Error?error.message:'Unspecified private QA failure';
    throw error;
  } finally {
    try {
      await restore();
      report.recovery.candidateRestoration='RESTORED_FLAG_DISABLED';
    } catch(error) {
      report.recovery.candidateRestoration='FAILED';
      report.recovery.candidateRestorationError=error instanceof Error?error.message:'Unknown candidate restoration failure';
      if(!firstError) {
        report.functionalQa='FAILED_CANDIDATE_RESTORATION';
        throw error;
      }
    } finally {
      await checkpoint();
    }
  }
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

/** The failed upload is immutable evidence, NOT an empty fixture. */
export const R4_FAILED_OWNER = Object.freeze({
 clientId:'39a03fb3-d913-4380-a30d-f983fabd22e1',
 galleryId:'66c091c1-8a4f-47a8-bc57-43cfbebfa0f0',
 imageId:'e5afb187-6384-4812-b647-eddb430dbe02',
 intentId:'b7bf8640-b49e-4d34-8092-9cfd3e6314e5',
});
export function assertR4ScopedExisting({source,restore,objects}) {
 const expected={client_accounts:1,client_galleries:1,client_gallery_images:1,client_gallery_upload_intents:1,client_gallery_favorites:0};
 assert.deepEqual(source,expected,'Original failed QA fixture must be untouched');
 assert.deepEqual(restore,Object.fromEntries(Object.keys(expected).map(k=>[k,0])),'Restore must remain empty');
 assert.deepEqual(objects,{originals:1,restored:0,backups:0},'Exactly one existing original; no backup or restored objects');
 return true;
}

/** Preserve all capacity checks, even though allocation is already owned. */
export function assertR4ScopedBudget(report) {
 assert.deepEqual(report.resources,R4_QA);
 assert.deepEqual(report.created?.databases,R4_RESUME_DATABASES);
 assert.deepEqual(report.created?.buckets,[R4_QA.originals,R4_QA.restored,R4_QA.backups]);
 for(const metric of ['r2Storage','r2Operations','workerUsage','d1Usage']) assert.equal(report[metric]?.accessible,true,'Fresh quota missing '+metric);
 const b=report.budget;
 assertFreshQaBudget({...b,databaseCount:b.databaseCount-2,namesInUse:b.namesInUse.filter(name=>!Object.values(R4_QA).includes(name))});
 assert.ok(Number.isSafeInteger(report.d1Budget?.rowsRead) && report.d1Budget.rowsRead<4_500_000);
 assert.ok(Number.isSafeInteger(report.d1Budget?.rowsWritten) && report.d1Budget.rowsWritten<90_000);
 return true;
}

export function r4ScopedRecoveryWorkerConfig(input) {
 const config=r4RecoveryWorkerConfig(input);
 config.vars.QA_RECOVERY_SEED_MODE='true';
 config.version_metadata={binding:'QA_VERSION'};
 return config;
}

// GET only: a newly published secret creates another Worker version. A denial
// from that exact version is final; only a prior version may still propagate.
export async function inspectR4ReadyVersion({origin,secret,versionId,fetch:fetcher=globalThis.fetch,pause,attempts=15,observations=[]}) {
 assert.ok(typeof versionId==='string'&&versionId.length>0);
 for(let i=0;i<attempts;i++) {
  const res=await fetcher(origin+'/qa/inspect',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Origin:origin,Authorization:'Bearer '+secret}});
  const actual=res.headers.get('X-QA-Version');
  observations.push({status:res.status,version:actual,expectedVersion:versionId});
  if(actual===versionId) {
   if(res.status!==200)throw Error('Scoped inspector current-version HTTP '+res.status);
   return res.json();
  }
  await res.arrayBuffer();
  if(![200,403,404,503].includes(res.status))throw Error('Unexpected prior-version inspector HTTP '+res.status);
  await pause(1000);
 }
 throw Error('Scoped inspector version did not propagate; no mutation replay');
}
