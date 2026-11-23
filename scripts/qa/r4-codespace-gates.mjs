// Turnkey R4 private-album live QA orchestrator for GitHub Codespaces.
//
// REUSE-FIRST: this file never reimplements a gate. It shells out to the real,
// already-reviewed gate scripts and records their verdicts. It is FAIL-CLOSED:
// a gate whose required secrets are unset is reported SKIP (never a fake pass),
// a gate that RAN and failed makes the process exit non-zero, and secret VALUES
// are never printed, logged, or written to any evidence file (only NAMES).
//
// Usage:
//   node scripts/qa/r4-codespace-gates.mjs              # all gates (SKIP where secrets absent)
//   node scripts/qa/r4-codespace-gates.mjs --local-only # only no-secret local gates

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const OUTPUT_DIR = "outputs/qa-r4-codespace";

// Each gate declares the exact underlying command, the environment variable
// NAMES it needs present (no values), and whether it is a local (no-secret) gate.
// `requiredSecrets` is the authoritative SKIP/RUN input: if any name is absent or
// blank in the provided env, the gate SKIPs and lists the missing names.
export const GATES = [
  {
    id: "G05-local-public-release-check",
    title: "G05 local 25 MiB candidate proof (public release guard)",
    command: ["node", "scripts/hostinger-r4-25mib-local-proof.mjs", "--public-release-check"],
    requiredSecrets: [],
    local: true,
  },
  {
    id: "G05-local-25mib-proof",
    title: "G05 local private 25 MiB raster proof against the candidate server",
    command: ["node", "scripts/hostinger-r4-25mib-local-proof.mjs"],
    requiredSecrets: [],
    local: true,
  },
  {
    id: "G05-remote-acceptance-http",
    title: "G05 remote managed acceptance over HTTP (upload/download integrity)",
    command: ["node", "scripts/hostinger-managed-acceptance-http.mjs"],
    requiredSecrets: [
      "PUNCTUM_MANAGED_PROBE",
      "SOURCE_ADMIN_EMAIL",
      "SOURCE_ADMIN_PASSWORD",
      "GITHUB_SHA",
    ],
    local: false,
  },
  {
    id: "G06-G14-functional-exercise",
    title: "G06-G14 managed synthetic functional exercise phase (negatives included)",
    command: ["node", "scripts/hostinger-managed-functional.mjs", "exercise"],
    requiredSecrets: [
      "PUNCTUM_QA_ORIGIN",
      "PUNCTUM_QA_ADMIN_EMAIL",
      "PUNCTUM_QA_TEST_PASSWORD",
      "GITHUB_SHA",
      "GITHUB_RUN_ID",
      "GITHUB_RUN_ATTEMPT",
    ],
    local: false,
  },
  {
    id: "G06-G14-functional-verify",
    title: "G06-G14 managed synthetic functional verify phase (negatives included)",
    command: ["node", "scripts/hostinger-managed-functional.mjs", "verify"],
    requiredSecrets: [
      "PUNCTUM_QA_ORIGIN",
      "PUNCTUM_QA_ADMIN_EMAIL",
      "PUNCTUM_QA_TEST_PASSWORD",
      "GITHUB_SHA",
      "GITHUB_RUN_ID",
      "GITHUB_RUN_ATTEMPT",
    ],
    local: false,
  },
  {
    id: "G06-G10-clerk-browser-proof",
    title: "G06-G10 Clerk browser login/logout/revocation proof",
    command: ["node", "scripts/hostinger-clerk-browser-proof.mjs"],
    requiredSecrets: [
      "CLERK_SECRET_KEY",
      "CLERK_PUBLISHABLE_KEY",
      "SOURCE_ADMIN_EMAIL",
      "PUNCTUM_CLERK_ADMIN_EMAIL",
      "PUNCTUM_CLERK_ADMIN_USER_ID",
      "PUNCTUM_CLERK_SESSION_ID",
      "PUNCTUM_CLERK_BROWSER_SESSION_JWT",
    ],
    local: false,
  },
  {
    id: "G17-managed-production-prepare",
    title: "G17 managed production prepare harness (writes recovery report.json)",
    command: ["python3", "scripts/hostinger_managed_production.py"],
    requiredSecrets: [
      "HOSTINGER_API",
      "SOURCE_ADMIN_EMAIL",
      "SOURCE_ADMIN_PASSWORD",
      "PUNCTUM_MANAGED_OUTPUT",
      "GITHUB_SHA",
    ],
    local: false,
  },
  {
    id: "G18-G23-recovery-download",
    title: "G18/G23 managed recovery download + isolated D1 restore verification",
    command: ["node", "scripts/hostinger-managed-recovery-download.mjs"],
    requiredSecrets: [
      "PUNCTUM_MANAGED_RECOVERY_PREFIX",
      "PUNCTUM_MANAGED_RECOVERY_KEY",
      "CLOUDFLARE_API_TOKEN",
    ],
    // Also depends on outputs/punctum-managed-production/report.json produced by
    // the G17 prepare harness; if that report is absent the gate fails closed.
    local: false,
  },
];

// Human/physical external gates this harness cannot close. Documented so the
// summary is explicit that a green run does NOT imply these are satisfied.
export const EXTERNAL_GATES = [
  { id: "G15", why: "assistive-technology (TalkBack/VoiceOver) verification is physical/human" },
  { id: "G19", why: "independent security sign-off is an external human review" },
  { id: "G20", why: "LGPD controller approval is an external human decision" },
  { id: "G22", why: "release authorization is an external human decision" },
];

// A secret NAME is considered present only when the env value is a non-empty,
// non-whitespace string. Returns the list of missing NAMES (never values).
export function missingSecrets(gate, env) {
  return gate.requiredSecrets.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

// Pure decision function (the core of the SKIP/RUN tests). Produces a plan entry
// for a gate given the current env and the --local-only flag. Never reads values.
export function decideGate(gate, env, { localOnly = false } = {}) {
  if (localOnly && !gate.local) {
    return {
      id: gate.id,
      title: gate.title,
      command: gate.command.join(" "),
      decision: "SKIP",
      reason: "skipped by --local-only (live gate)",
      missing: [],
    };
  }
  const missing = missingSecrets(gate, env);
  if (missing.length > 0) {
    return {
      id: gate.id,
      title: gate.title,
      command: gate.command.join(" "),
      decision: "SKIP",
      reason: "missing required secrets",
      missing,
    };
  }
  return {
    id: gate.id,
    title: gate.title,
    command: gate.command.join(" "),
    decision: "RUN",
    reason: null,
    missing: [],
  };
}

// Build the full ordered plan for all gates.
export function buildPlan(env, options = {}) {
  return GATES.map((gate) => decideGate(gate, env, options));
}

function sanitizeFilename(id) {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Runs one gate as a child process, tees stdout/stderr to the console and into a
// per-gate JSON evidence file. Resolves with the structured result. Never writes
// secret values: only captured child output (the gate scripts themselves are
// written to avoid echoing secrets) plus the required-secret NAME list.
export function runGate(gate, env, { spawnFn = spawn, outputDir = OUTPUT_DIR } = {}) {
  return new Promise((resolve) => {
    const [cmd, ...args] = gate.command;
    const child = spawnFn(cmd, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const startedAt = new Date().toISOString();
    const start = Date.now();
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    const finish = (code, signal, spawnError) => {
      const ok = spawnError == null && code === 0;
      const result = {
        id: gate.id,
        title: gate.title,
        command: gate.command.join(" "),
        decision: "RUN",
        verdict: ok ? "PASS" : "FAIL",
        exitCode: code,
        signal: signal ?? null,
        spawnError: spawnError ? spawnError.message : null,
        requiredSecrets: gate.requiredSecrets,
        startedAt,
        durationMs: Date.now() - start,
        stdout,
        stderr,
      };
      try {
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(
          join(outputDir, sanitizeFilename(gate.id) + ".json"),
          JSON.stringify(result, null, 2),
          { mode: 0o600 },
        );
      } catch (error) {
        result.evidenceError = error.message;
      }
      resolve(result);
    };
    child.on("error", (error) => finish(null, null, error));
    child.on("close", (code, signal) => finish(code, signal, null));
  });
}

function logPlan(plan) {
  console.log("R4 Codespace QA gate plan:");
  for (const entry of plan) {
    if (entry.decision === "RUN") {
      console.log(`  [RUN ] ${entry.id} -> ${entry.command}`);
    } else {
      const detail = entry.missing.length
        ? `${entry.reason}: ${entry.missing.join(", ")}`
        : entry.reason;
      console.log(`  [SKIP] ${entry.id} -> ${entry.command}  (${detail})`);
    }
  }
  console.log("");
  for (const external of EXTERNAL_GATES) {
    console.log(`  [EXTERNAL] ${external.id} cannot be closed by this harness: ${external.why}`);
  }
  console.log("");
}

export async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const localOnly = argv.includes("--local-only");
  const plan = buildPlan(env, { localOnly });
  logPlan(plan);

  const results = [];
  let ranFailures = 0;
  for (const entry of plan) {
    if (entry.decision !== "RUN") {
      results.push({
        id: entry.id,
        title: entry.title,
        command: entry.command,
        decision: "SKIP",
        verdict: "SKIP",
        reason: entry.reason,
        missing: entry.missing,
      });
      continue;
    }
    const gate = GATES.find((candidate) => candidate.id === entry.id);
    console.log(`\n=== RUN ${gate.id}: ${gate.command.join(" ")} ===`);
    const result = await runGate(gate, env, deps);
    if (result.verdict !== "PASS") {
      ranFailures += 1;
    }
    results.push(result);
  }

  const summary = {
    schema: "punctum-r4-codespace-qa-v1",
    generatedAt: new Date().toISOString(),
    localOnly,
    sourceSha: typeof env.GITHUB_SHA === "string" ? env.GITHUB_SHA : null,
    externalGates: EXTERNAL_GATES,
    totals: {
      gates: results.length,
      ran: results.filter((r) => r.decision === "RUN").length,
      passed: results.filter((r) => r.verdict === "PASS").length,
      failed: ranFailures,
      skipped: results.filter((r) => r.decision === "SKIP").length,
    },
    gates: results.map((r) => ({
      id: r.id,
      title: r.title,
      command: r.command,
      decision: r.decision,
      verdict: r.verdict,
      reason: r.reason ?? null,
      missing: r.missing ?? [],
      exitCode: r.exitCode ?? null,
      requiredSecrets: r.requiredSecrets ?? undefined,
    })),
  };

  const outputDir = deps.outputDir ?? OUTPUT_DIR;
  try {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, "summary.json"), JSON.stringify(summary, null, 2), {
      mode: 0o600,
    });
  } catch (error) {
    console.error(`Failed to write summary.json: ${error.message}`);
  }

  console.log("\nR4 Codespace QA summary:");
  console.log(`  ran=${summary.totals.ran} passed=${summary.totals.passed} failed=${summary.totals.failed} skipped=${summary.totals.skipped}`);

  // FAIL-CLOSED: exit non-zero only if a gate that actually RAN failed. An
  // all-SKIP run is exit 0 (nothing was proven, nothing was faked).
  const exitCode = ranFailures > 0 ? 1 : 0;
  return { summary, exitCode };
}

// Only execute when invoked directly, so the test file can import the pure
// functions without spawning anything.
const invokedPath = process.argv[1] ? process.argv[1].replace(/\\/g, "/") : "";
if (invokedPath.endsWith("scripts/qa/r4-codespace-gates.mjs")) {
  main().then(({ exitCode }) => {
    process.exitCode = exitCode;
  });
}
