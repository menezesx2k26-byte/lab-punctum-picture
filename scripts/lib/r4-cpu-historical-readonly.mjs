// Historical QA-only CPU analytics. This is not a deployment or evidence that
// the PR HEAD was executed in Cloudflare Workers Free.
export const R4_CPU_HISTORICAL = Object.freeze({
  account:"257bca437616da74ece1ce4bbaf0bd89",
  worker:"punctum-picture-r4-qa-20261028",
  freeCpuBudgetUs:10000,
});

export function summarizeHistoricalCpuMetrics(groups) {
  if (!Array.isArray(groups) || groups.length === 0)
    return {status:"BLOCKED_NO_HISTORICAL_CPU_SAMPLES",samples:0,
      aboveFreeBudgetObserved:null,cpuGatePassed:false,sourceCodeShaVerified:false};
  const values = groups.filter(x =>
    Number.isSafeInteger(x?.sum?.requests) && x.sum.requests > 0 &&
    Number.isSafeInteger(x?.sum?.errors) &&
    ["cpuTimeP50","cpuTimeP95","cpuTimeP99"].every(k =>
      typeof x?.quantiles?.[k] === "number" && Number.isFinite(x.quantiles[k]) && x.quantiles[k] >= 0));
  if (values.length !== groups.length)
    return {status:"BLOCKED_INCOMPLETE_CPU_ANALYTICS",samples:null,
      aboveFreeBudgetObserved:null,cpuGatePassed:false,sourceCodeShaVerified:false};
  const cpuP99Us = Math.max(...values.map(x=>x.quantiles.cpuTimeP99));
  return {status:"HISTORICAL_QA_CPU_ONLY_NOT_FINAL_BUILD",
    samples:values.reduce((sum,x)=>sum+x.sum.requests,0),
    errors:values.reduce((sum,x)=>sum+x.sum.errors,0),
    cpuP99Us,cpuBudgetUs:R4_CPU_HISTORICAL.freeCpuBudgetUs,
    aboveFreeBudgetObserved:cpuP99Us>R4_CPU_HISTORICAL.freeCpuBudgetUs,
    cpuGatePassed:false,sourceCodeShaVerified:false,
    note:"Adaptive analytics for the existing QA Worker cannot qualify this PR SHA, true cold/MISS cohort, or billing.",
  };
}
