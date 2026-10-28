import assert from 'node:assert/strict';

export const R4_QA = Object.freeze({
  worker: 'punctum-picture-r4-qa-20261028',
  source: 'punctum-picture-r4-qa-20261028',
  restore: 'punctum-picture-r4-restore-20261028',
  originals: 'punctum-r4-qa-originals-20261028',
  restored: 'punctum-r4-qa-restored-20261028',
  backups: 'punctum-r4-qa-backups-20261028',
});
const PRESERVED_DATABASES = new Set([
  '0801d4f1-7c85-4db4-8643-7b7c9e34862c',
  'b5087ae7-8c28-40eb-b541-8a58755131d3',
  '22697f13-7484-41e3-9441-f7b902c6577a',
  '4e959036-a3f0-4faf-bda2-fca9b4c5e984',
]);

/** No resource mutation until every usage dimension is measured and has margin. */
export function assertFreshQaBudget(input) {
  assertFreshPerformanceBudget(input);
  for (const [name, maximum] of [['maximumStorageBytes',9_000_000_000],['classARequests',900_000],['classBRequests',9_000_000]]) {
    assert.ok(Number.isSafeInteger(input.r2?.[name]) && input.r2[name] >= 0 && input.r2[name] < maximum, `Verified R2 ${name} headroom required`);
  }
  return true;
}

/** Uses only newly created IDs from this run, never inherited bindings. */
export function isolatedQaConfig(base, { databaseId, createdDatabaseIds, origin, restored = false, privateEnabled = true, performanceOnly = false }) {
  assert.ok(/^[a-f0-9-]{36}$/i.test(databaseId ?? '') && !PRESERVED_DATABASES.has(databaseId) && createdDatabaseIds?.includes(databaseId), 'Newly allocated QA database required');
  const url = new URL(origin);
  assert.ok(url.protocol === 'https:' && new RegExp(`^${R4_QA.worker}\\.[a-z0-9-]+\\.workers\\.dev$`).test(url.hostname) && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password, 'Dedicated QA origin required');
  const safeVars = {};
  for (const key of ['MAX_UPLOAD_BYTES','ALLOWED_MIME_TYPES','PRESIGNED_URL_TTL_SECONDS','CONTACT_RATE_LIMIT_WINDOW_SECONDS','CONTACT_RATE_LIMIT_MAX','ADMIN_RATE_LIMIT_WINDOW_SECONDS','ADMIN_RATE_LIMIT_MAX','BACKUP_PREFIX','BACKUP_RETENTION_DAYS','CLEANUP_ORPHAN_UPLOAD_AGE_HOURS']) {
    if (base.vars?.[key] !== undefined) safeVars[key] = base.vars[key];
  }
  return {
    name: R4_QA.worker, account_id: '257bca437616da74ece1ce4bbaf0bd89',
    main: base.main, no_bundle: base.no_bundle, rules: base.rules,
    compatibility_date: base.compatibility_date, compatibility_flags: base.compatibility_flags,
    assets: base.assets, workers_dev: true, preview_urls: false, routes: [], triggers: {crons: []},
    observability: {enabled: true, logs: {head_sampling_rate: 1}},
    vars: {...safeVars, ENVIRONMENT:'preview', PRIVATE_GALLERIES_ENABLED: String(privateEnabled && !performanceOnly), CLIENT_AUTH_MODE:'access', CLIENT_ACCESS_TEAM_DOMAIN:'qa-placeholder.cloudflareaccess.com', CLIENT_ACCESS_AUD:'r4-qa-access-unconfigured', SITE_ORIGIN:url.origin, PUBLIC_SITE_URL:url.origin, ADMIN_ALLOWED_EMAILS:'qa@punctum.invalid'},
    d1_databases: [{binding:'DB', database_name:restored ? R4_QA.restore : R4_QA.source, database_id:databaseId, migrations_dir:'../../migrations'}],
    r2_buckets: performanceOnly ? [] : [{binding:'ORIGINALS',bucket_name:restored ? R4_QA.restored : R4_QA.originals},{binding:'BACKUPS',bucket_name:R4_QA.backups}],
  };
}

export function assertFreshPerformanceBudget(input) {
  assert.ok(input && typeof input === 'object', 'Verified budget required');
  assert.ok(Array.isArray(input.subscriptions) && input.subscriptions.some(s => s.id === 'free'), 'Free subscription evidence required');
  assert.ok(!input.subscriptions.some(s => /workers.*(?:paid|standard|bundled|unbound)/i.test(s.id)), 'Paid Workers allowance is outside QA scope');
  assert.ok(Number.isInteger(input.databaseCount) && input.databaseCount >= 0 && input.databaseCount <= 8, 'Two free D1 slots required');
  assert.ok(Number.isInteger(input.workerRequestsToday) && input.workerRequestsToday >= 0 && input.workerRequestsToday <= 90_000, 'Verified daily Worker request headroom required');
  assert.ok(Array.isArray(input.namesInUse) && !input.namesInUse.some(name => Object.values(R4_QA).includes(name)), 'QA names already exist; preserve previous evidence');
  return true;
}

// Immutable allocation receipt: GitHub Actions 40756797747, before its network failure.
export const R4_RESUME_DATABASES = Object.freeze([
  Object.freeze({name:R4_QA.source,id:'2e7710f3-dc92-4aeb-976a-5f15d8c5262c'}),
  Object.freeze({name:R4_QA.restore,id:'0141b8f9-3074-4aa4-a184-92a4f7379ecc'}),
]);
export function assertResumeQaInventory({databases,buckets,workers}) {
  for(const expected of R4_RESUME_DATABASES) assert.equal(databases?.filter(d=>d.name===expected.name && d.uuid===expected.id).length,1,'Interrupted QA allocation must match both name and ID');
  for(const name of [R4_QA.originals,R4_QA.restored,R4_QA.backups]) assert.equal(buckets?.filter(b=>b.name===name).length,1,'Interrupted QA bucket missing');
  assert.equal(workers?.filter(w=>w.name===R4_QA.worker).length,1,'Interrupted QA Worker missing');
  return true;
}
export function summarizeQaSamples(samples,versionId) {
  return {
    errors:samples.filter(s=>s.status!==200).length,
    versionMismatches:samples.filter(s=>(s.status===200 || s.actualVersionId != null) && s.actualVersionId!==versionId).length,
  };
}

// Read-only performance may preserve the exact failed fixture from run40768574085.
// This receipt does not authorize upload/recovery or any write to private tables.
export function assertReadOnlyPerformanceFixture({counts,rows}) {
  assert.deepEqual(counts,{accounts:1,galleries:1,images:1,intents:1,favorites:0,pointers:1},'Performance continuation requires the exact preserved QA counts and initialized public configuration');
  assert.deepEqual(rows,[{
    clientId:'39a03fb3-d913-4380-a30d-f983fabd22e1',
    galleryId:'66c091c1-8a4f-47a8-bc57-43cfbebfa0f0',
    imageId:'e5afb187-6384-4812-b647-eddb430dbe02',
    intentId:'b7bf8640-b49e-4d34-8092-9cfd3e6314e5',
    imageStatus:'failed',intentStatus:'failed',
  }],'Unexpected QA private records; stop instead of resetting them');
  return true;
}

export function qaBuildSourceSha(label,{baselineSha,candidateSha}) {
  assert.ok(['baseline','candidate'].includes(label),'Unknown QA build label');
  const sha=label==='baseline'?baselineSha:candidateSha;
  assert.match(sha??'',/^[a-f0-9]{40}$/,'Actual configured build SHA is required');
  return sha;
}
