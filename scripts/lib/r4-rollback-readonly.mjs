// Safety boundary for read-only QA rollback inventory. Deliberately contains
// no action for deployment, restoration, R2 deletion or D1 mutation.
export const R4_ROLLBACK_QA = Object.freeze({
  account: "257bca437616da74ece1ce4bbaf0bd89",
  worker: "punctum-picture-r4-qa-20261028",
  databases: Object.freeze([
    Object.freeze({name:"punctum-picture-r4-qa-20261028",id:"2e7710f3-dc92-4aeb-976a-5f15d8c5262c"}),
    Object.freeze({name:"punctum-picture-r4-restore-20261028",id:"0141b8f9-3074-4aa4-a184-92a4f7379ecc"}),
  ]),
  buckets: Object.freeze([
    "punctum-r4-qa-originals-20261028",
    "punctum-r4-qa-restored-20261028",
    "punctum-r4-qa-backups-20261028",
  ]),
});

export function summarizeRollbackPreflight(data) {
  const subscriptions = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
  const scripts = Array.isArray(data?.scripts) ? data.scripts : [];
  const databases = Array.isArray(data?.databases) ? data.databases : [];
  const buckets = Array.isArray(data?.buckets?.buckets) ? data.buckets.buckets : [];
  const bindings = Array.isArray(data?.settings?.bindings) ? data.settings.bindings : [];
  const deployments = Array.isArray(data?.deployments?.deployments)
    ? data.deployments.deployments : Array.isArray(data?.deployments) ? data.deployments : [];
  const ids = [...new Set(deployments.flatMap(row => Array.isArray(row?.versions)
    ? row.versions.map(version => version?.version_id).filter(id => typeof id === "string" && /^[a-zA-Z0-9-]{8,128}$/.test(id))
    : []))];
  const subscriptionIds = subscriptions.map(row => row?.rate_plan?.id).filter(Boolean);
  const free = subscriptionIds.includes("free") && !subscriptionIds.some(id => id === "workers_paid");
  const expectedD1 = R4_ROLLBACK_QA.databases.every(expected =>
    databases.filter(db => db.name === expected.name && db.uuid === expected.id).length === 1);
  const expectedBuckets = R4_ROLLBACK_QA.buckets.every(name =>
    buckets.filter(bucket => bucket.name === name).length === 1);
  const expectedWorker = scripts.filter(script => script.id === R4_ROLLBACK_QA.worker).length === 1;
  const flag = bindings.find(binding => binding.name === "PRIVATE_GALLERIES_ENABLED" && binding.type === "plain_text")?.text ?? null;
  const knownBoundD1 = bindings.some(binding => binding.name === "DB" && binding.type === "d1" &&
    R4_ROLLBACK_QA.databases.some(db => db.id === binding.id));
  const inventoryVerified = free && expectedD1 && expectedBuckets && expectedWorker &&
    knownBoundD1 && flag !== null && ids.length > 0;
  const blockers = [
    "D1/R2 writable and truly segregated target not verified; historical QA fixtures remain immutable",
    "Exact prior Worker version/config/assets/Access fingerprints and reopening not homologated",
    "Remote D1/R2 object SHA-256 relations, sessions and zero-byte denial rollback not executed",
  ];
  if (!inventoryVerified) blockers.unshift("Incomplete or unexpected read-only QA account inventory");
  return {
    schemaVersion:1,
    scope:"PUNCTUM_R4_HISTORICAL_QA_READ_ONLY",
    accountPlan:free?"free":"unverified_or_not_free",
    qaWorker:R4_ROLLBACK_QA.worker,
    qaDatabaseCount:databases.length,
    qaBucketCount:buckets.length,
    flag,
    versionIds:ids,
    inventoryVerified,
    rollbackAuthorized:false,
    productionSafeToRelease:false,
    status:"BLOCKED_EXTERNAL",
    blockers,
    writes:0,
    secretValuesStored:false,
  };
}
