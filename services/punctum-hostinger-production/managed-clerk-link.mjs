import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bindApprovedAdmin, proofInputs } from "../../scripts/hostinger-clerk-production-proof.mjs";
import { openCandidateWritableDatabase } from "./candidate-sqlite.mjs";
import { createManagedBackup } from "./managed-restore-check.mjs";

export async function linkManagedClerkAdmin(config) {
  assert(config.managed && config.environment === "staging");
  assert(config.dbFile === "/home/u571409090/punctum-managed-storage/punctum-managed-private-20261114/application.sqlite");
  assert(process.env.PUNCTUM_MANAGED_APPROVED_CLERK_LINK === "operator-approved-existing-user");
  const input = proofInputs(process.env);
  const report = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL("../../scripts/hostinger-clerk-production-proof.mjs", import.meta.url))], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 90_000,
  }));
  assert(report.status === "passed" && report.checks.selectedIdentityVerified && report.checks.realJwtVerifiedByWorker && report.checks.unlinkedDenied);
  const snapshot = await createManagedBackup(config);
  try {
    const db = openCandidateWritableDatabase(config.dbFile, { candidateMode: "PRIVATE_PRODUCTION_CANDIDATE" });
    try {
      const result = await bindApprovedAdmin(db, input);
      return { status: "MANAGED_CLERK_ADMIN_LINK_VERIFIED", ...result, backupSha256: snapshot.archiveSha256,
        backendChecks: report.checks, runtimeAuthMode: "legacy", publicCutover: false };
    } finally { db.close(); }
  } finally { snapshot.cleanup(); }
}
