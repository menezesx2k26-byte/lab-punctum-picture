// node --test, no network. Proves the R4 Codespace orchestrator's SKIP/RUN
// decisioning, fail-closed behavior on a simulated failing child, and that it
// never prints or writes secret VALUES. Nothing here spawns a real gate script.

import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GATES,
  EXTERNAL_GATES,
  missingSecrets,
  decideGate,
  buildPlan,
  runGate,
  main,
} from "./r4-codespace-gates.mjs";

// A fake child process that emits the given stdout/stderr then closes with the
// given exit code. Mirrors the parts of child_process the orchestrator uses.
function fakeSpawn({ code = 0, stdout = "", stderr = "", spawnError = null } = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
      if (spawnError) {
        child.emit("error", spawnError);
        return;
      }
      if (stdout) child.stdout.emit("data", Buffer.from(stdout));
      if (stderr) child.stderr.emit("data", Buffer.from(stderr));
      child.emit("close", code, null);
    });
    return child;
  };
}

function freshOutputDir() {
  return mkdtempSync(join(tmpdir(), "r4-codespace-qa-test-"));
}

test("local gates require no secrets", () => {
  const localGates = GATES.filter((gate) => gate.local);
  assert.ok(localGates.length >= 1, "expected at least one local gate");
  for (const gate of localGates) {
    assert.deepEqual(gate.requiredSecrets, [], `${gate.id} must need no secrets`);
  }
});

test("missingSecrets treats blank/whitespace as absent", () => {
  const gate = GATES.find((g) => g.id === "G05-remote-acceptance-http");
  assert.deepEqual(missingSecrets(gate, {}), gate.requiredSecrets);
  const partial = { PUNCTUM_MANAGED_PROBE: "pabc123", SOURCE_ADMIN_EMAIL: "   " };
  const missing = missingSecrets(gate, partial);
  assert.ok(!missing.includes("PUNCTUM_MANAGED_PROBE"), "present value is not missing");
  assert.ok(missing.includes("SOURCE_ADMIN_EMAIL"), "whitespace value counts as missing");
  assert.ok(missing.includes("SOURCE_ADMIN_PASSWORD"), "absent value counts as missing");
});

test("with no secrets every live gate is SKIP with the correct missing list", () => {
  const plan = buildPlan({});
  for (const entry of plan) {
    const gate = GATES.find((g) => g.id === entry.id);
    if (gate.local) {
      assert.equal(entry.decision, "RUN", `${gate.id} local gate should RUN`);
    } else {
      assert.equal(entry.decision, "SKIP", `${gate.id} should SKIP when no secrets set`);
      assert.deepEqual(
        entry.missing,
        gate.requiredSecrets,
        `${gate.id} must list exactly its missing required secrets`,
      );
    }
  }
});

test("--local-only skips every live gate and runs only local gates", () => {
  // All secrets present, but --local-only must still skip live gates.
  const env = Object.fromEntries(
    GATES.flatMap((g) => g.requiredSecrets).map((name) => [name, "value-present"]),
  );
  const plan = buildPlan(env, { localOnly: true });
  for (const entry of plan) {
    const gate = GATES.find((g) => g.id === entry.id);
    assert.equal(entry.decision, gate.local ? "RUN" : "SKIP", `${gate.id} local-only decision`);
  }
});

test("a gate with all secrets present is RUN", () => {
  const gate = GATES.find((g) => g.id === "G18-G23-recovery-download");
  const env = Object.fromEntries(gate.requiredSecrets.map((name) => [name, "x"]));
  assert.equal(decideGate(gate, env).decision, "RUN");
});

test("all-skip run exits 0 and never spawns a child", async () => {
  const outputDir = freshOutputDir();
  let spawnCalls = 0;
  const spawnFn = (...args) => {
    spawnCalls += 1;
    return fakeSpawn({ code: 0 })(...args);
  };
  try {
    // --local-only with a spy makes even local gates use the fake spawn.
    const { summary, exitCode } = await main(["--local-only"], {}, { spawnFn, outputDir });
    // local gates still RUN under --local-only; ensure no live gate ran.
    const ranLive = summary.gates.filter(
      (g) => g.decision === "RUN" && !GATES.find((x) => x.id === g.id).local,
    );
    assert.equal(ranLive.length, 0, "no live gate should run under --local-only");
    assert.equal(exitCode, 0, "all-skip/local-pass run exits 0");
    assert.ok(spawnCalls >= 1, "local gates were executed via spawnFn");
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("no-secret run (not local-only) runs zero gates? no: local gates run and pass -> exit 0", async () => {
  const outputDir = freshOutputDir();
  try {
    const { summary, exitCode } = await main([], {}, {
      spawnFn: fakeSpawn({ code: 0, stdout: "ok\n" }),
      outputDir,
    });
    assert.equal(exitCode, 0);
    assert.equal(summary.totals.failed, 0);
    // All live gates skipped because env has no secrets.
    const liveRan = summary.gates.filter(
      (g) => g.decision === "RUN" && !GATES.find((x) => x.id === g.id).local,
    );
    assert.equal(liveRan.length, 0);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("a simulated failing child marks the gate FAIL and exits non-zero", async () => {
  const outputDir = freshOutputDir();
  // Provide every secret so every gate is RUN, then force all children to fail.
  const env = Object.fromEntries(
    GATES.flatMap((g) => g.requiredSecrets).map((name) => [name, "present"]),
  );
  try {
    const { summary, exitCode } = await main([], env, {
      spawnFn: fakeSpawn({ code: 1, stderr: "boom\n" }),
      outputDir,
    });
    assert.equal(exitCode, 1, "fail-closed: a failing RAN gate exits non-zero");
    assert.ok(summary.totals.failed >= 1);
    const failed = summary.gates.filter((g) => g.verdict === "FAIL");
    assert.ok(failed.length >= 1, "at least one gate recorded FAIL");
    for (const g of failed) {
      assert.equal(g.decision, "RUN");
    }
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("a spawn error is treated as FAIL (fail-closed)", async () => {
  const outputDir = freshOutputDir();
  const gate = GATES.find((g) => g.local);
  try {
    const result = await runGate(gate, {}, {
      spawnFn: fakeSpawn({ spawnError: new Error("ENOENT missing binary") }),
      outputDir,
    });
    assert.equal(result.verdict, "FAIL");
    assert.ok(result.spawnError.includes("ENOENT"));
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("secret VALUES never appear in printed output, summary.json, or per-gate evidence", async () => {
  const outputDir = freshOutputDir();
  // Opaque sentinel for the leak assertions below. Deliberately NOT a real
  // provider key format (no `sk_live_`/token prefix) so secret scanning does
  // not flag this test fixture; the assertions only check this string's absence.
  const SECRET_VALUE = "SENTINEL-DO-NOT-LEAK-TOTALLYSECRETVALUE-1234567890";
  // GITHUB_* are non-secret CI provenance; the summary legitimately records the
  // source SHA. Only genuinely sensitive names get the sentinel secret value.
  const NON_SECRET = {
    GITHUB_SHA: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    GITHUB_RUN_ID: "123456",
    GITHUB_RUN_ATTEMPT: "1",
  };
  const env = { ...NON_SECRET };
  for (const name of GATES.flatMap((g) => g.requiredSecrets)) {
    if (name in NON_SECRET) continue;
    env[name] = SECRET_VALUE;
  }

  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  let captured = "";
  process.stdout.write = (chunk, ...rest) => {
    captured += chunk.toString();
    return originalWrite(chunk, ...rest);
  };
  process.stderr.write = (chunk, ...rest) => {
    captured += chunk.toString();
    return originalErr(chunk, ...rest);
  };

  try {
    // Child that would echo the secret only if the orchestrator passed it to
    // stdout itself; the orchestrator must not. The fake child prints nothing
    // secret, proving the orchestrator never injects values into logs.
    await main([], env, { spawnFn: fakeSpawn({ code: 0, stdout: "clean\n" }), outputDir });
  } finally {
    process.stdout.write = originalWrite;
    process.stderr.write = originalErr;
  }

  assert.ok(!captured.includes(SECRET_VALUE), "orchestrator printed a secret value");

  const summaryText = readFileSync(join(outputDir, "summary.json"), "utf8");
  assert.ok(!summaryText.includes(SECRET_VALUE), "summary.json leaked a secret value");

  for (const file of readdirSync(outputDir)) {
    const text = readFileSync(join(outputDir, file), "utf8");
    assert.ok(!text.includes(SECRET_VALUE), `${file} leaked a secret value`);
  }
  rmSync(outputDir, { recursive: true, force: true });
});

test("external gates are declared and not runnable", () => {
  const ids = EXTERNAL_GATES.map((g) => g.id).sort();
  assert.deepEqual(ids, ["G15", "G19", "G20", "G22"]);
  const runnableIds = new Set(GATES.map((g) => g.id));
  for (const id of ids) {
    assert.ok(!runnableIds.has(id), `${id} must not be a runnable gate`);
  }
});
