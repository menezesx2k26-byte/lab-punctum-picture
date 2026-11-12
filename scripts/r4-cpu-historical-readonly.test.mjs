import test from "node:test";
import assert from "node:assert/strict";
import {summarizeHistoricalCpuMetrics} from "./lib/r4-cpu-historical-readonly.mjs";

test("no CPU samples or incomplete telemetry cannot qualify Workers Free",()=>{
  for(const data of [[],null]) {
    const result=summarizeHistoricalCpuMetrics(data);
    assert.equal(result.cpuGatePassed,false);
    assert.equal(result.samples,0);
  }
  const invalid=summarizeHistoricalCpuMetrics([{sum:{requests:3,errors:0},quantiles:{cpuTimeP50:1,cpuTimeP95:2}}]);
  assert.equal(invalid.status,"BLOCKED_INCOMPLETE_CPU_ANALYTICS");
  assert.equal(invalid.cpuGatePassed,false);
});
test("historical CPU over 10 ms is reported, never promoted to final code readiness",()=>{
  const result=summarizeHistoricalCpuMetrics([{sum:{requests:63,errors:0},quantiles:{cpuTimeP50:31000,cpuTimeP95:57000,cpuTimeP99:145000}}]);
  assert.equal(result.samples,63);
  assert.equal(result.cpuP99Us,145000);
  assert.equal(result.aboveFreeBudgetObserved,true);
  assert.equal(result.cpuGatePassed,false);
  assert.equal(result.sourceCodeShaVerified,false);
});
test("historical low CPU or partial account traffic still does not certify cold MISS",()=>{
  const result=summarizeHistoricalCpuMetrics([{sum:{requests:9,errors:0},quantiles:{cpuTimeP50:500,cpuTimeP95:2000,cpuTimeP99:4000}}]);
  assert.equal(result.aboveFreeBudgetObserved,false);
  assert.equal(result.cpuGatePassed,false);
  assert.equal(result.status,"HISTORICAL_QA_CPU_ONLY_NOT_FINAL_BUILD");
  assert.ok(!JSON.stringify(result).includes("Bearer"));
});
