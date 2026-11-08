/**
 * Read-only Images capability gate. Incomplete entitlement or sampled analytics
 * cannot authorize mutation, billing, feature activation or production release.
 */
export function summarizeSubscriptions(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { plan:"UNVERIFIED", workerPlan:"unknown" };
  const ids = rows.map(row=>String(row?.id ?? "").trim().toLowerCase()).filter(Boolean);
  if (!ids.length) return { plan:"UNVERIFIED",workerPlan:"unknown" };
  const paidWorkers = ids.some(id=>/workers.*(?:paid|standard|bundled|unbound)/.test(id));
  const workerPlan = paidWorkers ? "paid"
    : ids.some(id=>/^(?:free|workers_free|workers-free)$/.test(id)) ? "free" : "unknown";
  // Unknown Images subscriptions are not proof of Free: only the *absence*
  // of a non-Free Images/Resizing subscription in a complete inventory qualifies.
  const paidImages = ids.some(id=>/(?:images?|resizing)/.test(id) && !/(?:images?)[_-]?free/.test(id));
  return {plan:paidImages ? "PAID_OR_LEGACY" : workerPlan === "free" ? "FREE_CANDIDATE" : "UNVERIFIED",workerPlan};
}
export function summarizeImageUsage(rows,today) {
  if (!Array.isArray(rows) || typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today))
    return {current:null,observedDate:null};
  const month=today.slice(0,7);
  const recent=rows.filter(row=>typeof row?.date==="string" && row.date.startsWith(month)
    && row.date<=today && Number.isSafeInteger(row.transformations) && row.transformations>=0)
    .sort((a,b)=>b.date.localeCompare(a.date));
  const item=recent[0];
  if (!item) return {current:null,observedDate:null};
  const age=Math.floor((Date.parse(today+"T00:00:00Z")-Date.parse(item.date+"T00:00:00Z"))/86_400_000);
  if (!Number.isFinite(age) || age>1) return {current:null,observedDate:item.date};
  return {current:item.transformations,observedDate:item.date};
}
export function decideImageQaReadiness({plan,transformations,workerPlan,source}) {
  const mayAttemptSyntheticQa=plan==="FREE_CANDIDATE" && workerPlan==="free"
    && source==="graphql" && Number.isSafeInteger(transformations)
    && transformations>=0 && transformations<4900;
  return {mayAttemptSyntheticQa,
    reason:mayAttemptSyntheticQa?"READ_ONLY_FREE_CANDIDATE_NOT_BILLING_PROOF":"BLOCKED_BY_UNVERIFIED_PLAN_OR_CAPACITY"};
}