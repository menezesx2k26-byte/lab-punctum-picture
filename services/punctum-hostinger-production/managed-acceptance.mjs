import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cleanupManagedFixture } from "./managed-fixture-cleanup.mjs";
import { proveManagedRestore } from "./managed-restore-check.mjs";

export async function managedAcceptance(config, marker, { cleanupOnly = false } = {}) {
  const report = {};
  const encoded = process.env.PUNCTUM_MANAGED_E2E_FIXTURE;
  if (encoded) {
    if (encoded.length > 24000 || !/^[A-Za-z0-9+/]+=*$/.test(encoded)) throw Error("MANAGED_FIXTURE_CONFIGURATION_INVALID");
    const fixture = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    report.cleanup = await cleanupManagedFixture(config, fixture, marker);
  }
  if (cleanupOnly) return { status: "MANAGED_OPERATIONS_VERIFIED", ...report };
  report.jobs = [];
  for (const mode of ["hourly", "daily"]) {
    const stdout = execFileSync(process.execPath, [fileURLToPath(new URL("./candidate-cron.mjs", import.meta.url)), mode], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000,
    });
    const lines = stdout.trim().split("\n");
    const result = lines.map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .find((item) => item?.status === "CANDIDATE_SCHEDULED_JOB_PASS" && item.cronMode === mode);
    if (!result) throw Error("MANAGED_SCHEDULED_RECEIPT_MISSING");
    report.jobs.push(result);
  }
  report.restore = await proveManagedRestore(config);
  return { status: "MANAGED_OPERATIONS_VERIFIED", ...report };
}
