#!/usr/bin/env node
/**
 * Trusted-runner only: read Clerk Backend API instance metadata.
 * Never prints secret values. Session max lifetime is Dashboard/Platform API —
 * Backend GET /v1/instance does not expose R1 max lifetime (see Clerk session-options docs).
 */
const REDACT = "[redacted]";

function present(name) {
  const v = process.env[name];
  return Boolean(v && String(v).trim());
}

function keyPrefix(value) {
  if (!value || typeof value !== "string") return null;
  if (value.startsWith("sk_live_")) return "sk_live_";
  if (value.startsWith("sk_test_")) return "sk_test_";
  if (value.startsWith("pk_live_")) return "pk_live_";
  if (value.startsWith("pk_test_")) return "pk_test_";
  return "unknown_prefix";
}

function sanitizeInstance(raw) {
  if (!raw || typeof raw !== "object") return { shape: typeof raw };
  const out = {};
  for (const key of [
    "id",
    "object",
    "environment_type",
    "environment",
    "application_name",
    "application_id",
    "home_url",
    "domain",
    "support_email",
  ]) {
    if (raw[key] != null && (typeof raw[key] === "string" || typeof raw[key] === "number" || typeof raw[key] === "boolean")) {
      out[key] = raw[key];
    }
  }
  // Explicitly refuse to copy anything that looks like a secret.
  for (const key of Object.keys(raw)) {
    if (/secret|token|password|key/i.test(key) && !(key in out)) {
      out[key] = REDACT;
    }
  }
  return out;
}

async function clerkGet(secret, path) {
  const response = await fetch("https://api.clerk.com/v1" + path, {
    headers: {
      Authorization: "Bearer " + secret,
      Accept: "application/json",
      "User-Agent": "PunctumClerkInstanceReadonly/1.0",
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { parse_error: true, bytes: text.length };
  }
  return { status: response.status, body };
}

async function main() {
  const candidates = [
    { envName: "PUNCTUM_CLERK_PRODUCTION_SECRET_KEY", value: process.env.PUNCTUM_CLERK_PRODUCTION_SECRET_KEY },
    { envName: "CLERK_SECRET_KEY", value: process.env.CLERK_SECRET_KEY },
  ];

  const report = {
    schema: 1,
    measuredAt: new Date().toISOString(),
    purpose: "G01/G02 Clerk secret presence + instance identity (R1 max lifetime NOT via Backend API)",
    docs: "https://clerk.com/docs/guides/secure/session-options",
    secretPresence: {
      PUNCTUM_CLERK_PRODUCTION_SECRET_KEY: present("PUNCTUM_CLERK_PRODUCTION_SECRET_KEY"),
      CLERK_SECRET_KEY: present("CLERK_SECRET_KEY"),
      PUNCTUM_CLERK_PRODUCTION_PUBLISHABLE_KEY: present("PUNCTUM_CLERK_PRODUCTION_PUBLISHABLE_KEY"),
    },
    keyPrefixes: Object.fromEntries(
      candidates.map((c) => [c.envName, keyPrefix(c.value)]),
    ),
    attempts: [],
    r1: {
      status: "BLOCKED_API_GAP",
      reason:
        "Clerk Maximum lifetime / Inactivity timeout are Dashboard Sessions (Platform API session_settings). Backend API PATCH/GET /instance does not expose or set max session lifetime. JWT ~60s is session-token TTL, not R1 proof.",
      dashboardPath: "Clerk Dashboard → Sessions → Maximum lifetime ≤ 14 days (≤ 336 hours)",
      productionSettingsChanged: false,
      sessionsRevoked: false,
    },
  };

  let used = null;
  for (const candidate of candidates) {
    if (!candidate.value) {
      report.attempts.push({ envName: candidate.envName, result: "ABSENT" });
      continue;
    }
    const prefix = keyPrefix(candidate.value);
    if (prefix === "pk_live_" || prefix === "pk_test_") {
      report.attempts.push({
        envName: candidate.envName,
        keyPrefix: prefix,
        result: "MISNAMED_PUBLISHABLE_NOT_BACKEND_SECRET",
      });
      continue;
    }
    if (prefix !== "sk_live_" && prefix !== "sk_test_") {
      report.attempts.push({
        envName: candidate.envName,
        keyPrefix: prefix,
        result: "UNEXPECTED_KEY_PREFIX_SKIPPED",
      });
      continue;
    }
    const result = await clerkGet(candidate.value, "/instance");
    const attempt = {
      envName: candidate.envName,
      http: result.status,
      keyPrefix: prefix,
    };
    if (result.status === 200) {
      attempt.instance = sanitizeInstance(result.body);
      attempt.result = "VALID";
      used = candidate.envName;
      report.attempts.push(attempt);
      break;
    }
    if (result.status === 401 || result.status === 403) {
      attempt.result = "INVALID_OR_UNAUTHORIZED";
      attempt.clerkErrorCode = result.body?.errors?.[0]?.code ?? null;
    } else {
      attempt.result = "UNEXPECTED_HTTP";
    }
    report.attempts.push(attempt);
  }

  if (!used) {
    report.verdict = report.secretPresence.PUNCTUM_CLERK_PRODUCTION_SECRET_KEY || report.secretPresence.CLERK_SECRET_KEY
      ? "SECRET_PRESENT_BUT_REJECTED"
      : "SECRET_MISSING_IN_ACTIONS_CONTEXT";
  } else {
    report.verdict = "INSTANCE_READ_OK";
    report.secretNameUsed = used;
    const envType = report.attempts.find((a) => a.envName === used)?.instance?.environment_type
      ?? report.attempts.find((a) => a.envName === used)?.instance?.environment
      ?? null;
    report.instanceClass = envType;
  }

  // Optional: probe endpoints that must never leak secrets into logs.
  if (used) {
    const secret = process.env[used];
    for (const path of ["/jwt_templates", "/users?limit=1"]) {
      const probe = await clerkGet(secret, path);
      report.attempts.push({
        probe: path,
        http: probe.status,
        note: path.includes("users")
          ? "existence probe only; user payloads discarded"
          : "jwt_templates list status only",
      });
    }
  }

  const json = JSON.stringify(report, null, 2) + "\n";
  if (/sk_(live|test)_[A-Za-z0-9]+/.test(json)) {
    throw new Error("REFUSING_TO_PRINT_SECRET_MATERIAL");
  }
  process.stdout.write(json);
  if (report.verdict !== "INSTANCE_READ_OK" && report.verdict !== "SECRET_MISSING_IN_ACTIONS_CONTEXT") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: true, name: error?.name, message: String(error?.message || error).slice(0, 200) }));
  process.exit(1);
});
