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
  // A deployment list with only one version cannot identify any predecessor
  // for rollback. This remains a read-only inventory condition, NOT proof that
  // a second ID is a verified deploy/config/assets restore target.
  const versionHistoryPresent = ids.length >= 2;
  const subscriptionIds = subscriptions.map(row => row?.rate_plan?.id).filter(Boolean);
  const free = subscriptionIds.includes("free") && !subscriptionIds.some(id => id === "workers_paid");
  const expectedD1 = R4_ROLLBACK_QA.databases.every(expected =>
    databases.filter(db => db.name === expected.name && db.uuid === expected.id).length === 1);
  const expectedBuckets = R4_ROLLBACK_QA.buckets.every(name =>
    buckets.filter(bucket => bucket.name === name).length === 1);
  const expectedWorker = scripts.filter(script => script.id === R4_ROLLBACK_QA.worker).length === 1;
  const flag = bindings.find(binding => binding.name === "PRIVATE_GALLERIES_ENABLED" && binding.type === "plain_text")?.text ?? null;
  const knownBoundD1 = bindings.filter(binding => binding.name === "DB").length === 1 &&
    bindings.some(binding => binding.name === "DB" && binding.type === "d1" &&
      binding.id === R4_ROLLBACK_QA.databases[0].id);
  const inventoryVerified = free && expectedD1 && expectedBuckets && expectedWorker &&
    knownBoundD1 && flag === "false" && versionHistoryPresent;
  const blockers = [
    "D1/R2 writable and truly segregated target not verified; historical QA fixtures remain immutable",
    "Exact prior Worker version/config/assets/Access fingerprints and reopening not homologated",
    "Remote D1/R2 object SHA-256 relations, sessions and zero-byte denial rollback not executed",
  ];
  if (!inventoryVerified) blockers.unshift("Incomplete or unexpected read-only QA account inventory");
  if (!versionHistoryPresent)
    blockers.unshift("No distinct prior Worker version in read-only deployment history");
  return {
    schemaVersion:1,
    scope:"PUNCTUM_R4_HISTORICAL_QA_READ_ONLY",
    accountPlan:free?"free":"unverified_or_not_free",
    qaWorker:R4_ROLLBACK_QA.worker,
    qaDatabaseCount:databases.length,
    qaBucketCount:buckets.length,
    flag,
    versionIds:ids,
    versionHistoryPresent,
    inventoryVerified,
    rollbackAuthorized:false,
    productionSafeToRelease:false,
    status:"BLOCKED_EXTERNAL",
    blockers,
    writes:0,
    secretValuesStored:false,
  };
}

/** Diagnose API permissions without serializing provider error bodies or token
 * details. A 401 against D1 alongside successful Worker GETs does not prove
 * that all credentials are invalid, only that this resource is unauthorized.
 */
/** Token verification is a separate GET; never persist token ID, raw API
 * payload, expiration metadata or the bearer value in durable evidence. */
export function summarizeTokenReadOnlyCheck(probe, accountScopedProbe = null) {
  // User-owned and account-owned API tokens can have different verify
  // endpoints. If the user endpoint is inconclusive, inspect the already-
  // known account-scoped GET result without ever persisting token IDs.
  const recognized = result => result?.ok === true && result?.http === 200 &&
    ["active","disabled","expired"].includes(result?.value?.status);
  const selected = !recognized(probe) && accountScopedProbe ? accountScopedProbe : probe;
  const status = recognized(selected) ? selected.value.status : "unverified";
  return {
    http: typeof selected?.http === "number" ? selected.http : "NETWORK_ERROR",
    status,
    verifiedActive: status === "active",
  };
}

export function summarizeQaReadOnlyProbes(probes, tokenCheck = null) {
  const sections = ["subscriptions", "scripts", "databases", "buckets", "settings", "deployments"];
  const diagnostics = {};
  const incomplete = [];
  const active = tokenCheck?.verifiedActive === true;
  for (const section of sections) {
    const result = probes?.[section];
    if (result?.success === true && result?.http === 200) continue;
    incomplete.push(section);
    if (result?.http === 401) diagnostics[section] = active
      ? "HTTP_401_ACTIVE_TOKEN_SCOPE_OR_RESOURCE_ACCESS_UNVERIFIED"
      : "HTTP_401_AUTH_OR_RESOURCE_PERMISSION_UNVERIFIED";
    else if (result?.http === 403) diagnostics[section] = active && section === "subscriptions"
      ? "HTTP_403_BILLING_READ_OR_ACCOUNT_ROLE_REQUIRED"
      : "HTTP_403_SCOPE_OR_ACCOUNT_ACCESS_REQUIRED";
    else if (result?.http === "NETWORK_ERROR") diagnostics[section] = "NETWORK_READ_ONLY_PROBE_FAILED";
    else diagnostics[section] = "READ_ONLY_RESOURCE_UNVERIFIED";
  }
  return {
    complete: incomplete.length === 0,
    status: incomplete.length ? "BLOCKED_READ_ONLY_SCOPES_UNVERIFIED" : "READ_ONLY_RESPONSES_COMPLETE",
    incomplete,
    diagnostics,
    credentialVerifiedActive: active,
    rollbackAuthorized: false,
    writes: 0,
  };
}
