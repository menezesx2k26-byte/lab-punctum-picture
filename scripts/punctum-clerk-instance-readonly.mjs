#!/usr/bin/env node
/**
 * Trusted-runner only: read Clerk Backend API instance metadata.
 * Never prints secret values. Probes every configured backend secret.
 * Maximum session lifetime is Dashboard / Platform API session_settings —
 * a short JWT expiry or HTTP 200 is not R1 proof.
 */
import { pathToFileURL } from "node:url";

const REDACT = "[redacted]";
export const KNOWN_PRODUCTION_INSTANCE_ID = "ins_3M6H9ktM3jO84RvEu5BmKFokCfr";
const SECRET_MATERIAL = /sk_(live|test)_[A-Za-z0-9]+/;
const SESSION_KEY = /lifetime|inactiv|session_setting|max_age|clock_skew|multi_session/i;

export function keyPrefix(value) {
  if (!value || typeof value !== "string") return null;
  if (value.startsWith("sk_live_")) return "sk_live_";
  if (value.startsWith("sk_test_")) return "sk_test_";
  if (value.startsWith("pk_live_")) return "pk_live_";
  if (value.startsWith("pk_test_")) return "pk_test_";
  return "unknown_prefix";
}

export function classifyCredential(value) {
  if (!value || !String(value).trim()) {
    return { prefix: null, classification: "ABSENT", publishable: false, backendCallable: false };
  }
  const prefix = keyPrefix(String(value));
  if (prefix === "pk_live_" || prefix === "pk_test_") {
    return {
      prefix,
      classification: "INVALID_BACKEND_SECRET",
      publishable: true,
      backendCallable: false,
    };
  }
  if (prefix === "sk_live_" || prefix === "sk_test_") {
    return { prefix, classification: prefix, publishable: false, backendCallable: true };
  }
  return {
    prefix,
    classification: "INVALID_BACKEND_SECRET",
    publishable: false,
    backendCallable: false,
  };
}

export function assertNoSecretMaterial(json) {
  if (SECRET_MATERIAL.test(json)) {
    throw new Error("REFUSING_TO_PRINT_SECRET_MATERIAL");
  }
}

function present(name) {
  const value = process.env[name];
  return Boolean(value && String(value).trim());
}

function isSafeScalar(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (typeof value !== "string") return false;
  if (value.length > 80 || SECRET_MATERIAL.test(value) || value.startsWith("pk_")) return false;
  return /^[A-Za-z0-9_.:/+ -]+$/.test(value);
}

function copySafe(value, depth) {
  if (depth > 4) return { truncated: true };
  if (typeof value === "string" && (SECRET_MATERIAL.test(value) || value.startsWith("pk_"))) return REDACT;
  if (isSafeScalar(value)) return value;
  if (Array.isArray(value)) return { arrayLength: value.length };
  if (!value || typeof value !== "object") return undefined;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (/secret|password|api_key/i.test(key)) {
      out[key] = REDACT;
      continue;
    }
    const copied = copySafe(child, depth + 1);
    if (copied !== undefined) out[key] = copied;
  }
  return out;
}

export function extractSessionEvidence(body) {
  const topLevelKeys = body && typeof body === "object" && !Array.isArray(body)
    ? Object.keys(body).sort()
    : [];
  const sessionFields = {};
  function walk(node, path, depth) {
    if (!node || typeof node !== "object" || depth > 5) return;
    for (const [key, value] of Object.entries(node)) {
      const next = path ? `${path}.${key}` : key;
      if (SESSION_KEY.test(key) || (path && SESSION_KEY.test(path))) {
        const copied = copySafe(value, 0);
        if (copied !== undefined) sessionFields[next] = copied;
        if (value && typeof value === "object") walk(value, next, depth + 1);
        continue;
      }
      if (value && typeof value === "object") walk(value, next, depth + 1);
    }
  }
  walk(body, "", 0);
  return {
    topLevelKeys,
    sessionFields,
    sessionFieldsPresent: Object.keys(sessionFields).length > 0,
  };
}

export function interpretLifetime(key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const amount = value.amount ?? value.value ?? value.duration;
    const unit = value.unit ?? value.units;
    if (typeof amount === "number" && typeof unit === "string") {
      return interpretLifetime(`${key}_${unit}`, amount);
    }
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (/hour/i.test(key)) return { unit: "hours", value, within14d: value <= 336 };
  if (/day/i.test(key)) return { unit: "days", value, within14d: value <= 14 };
  if (/minute/i.test(key)) return { unit: "minutes", value, within14d: value <= 14 * 24 * 60 };
  if (/second/i.test(key)) return { unit: "seconds", value, within14d: value <= 14 * 24 * 3600 };
  return { unit: "unspecified", value, within14d: null };
}

export function assessR1(sessionFields) {
  const fields = sessionFields && typeof sessionFields === "object" ? sessionFields : {};
  let maximum = null;
  let inactivity = null;
  let token = null;
  for (const [key, value] of Object.entries(fields)) {
    const interpreted = interpretLifetime(key, value);
    if (!interpreted) continue;
    if (/token|jwt|clock_skew|template/i.test(key)) {
      token = token ?? interpreted;
      continue;
    }
    if (/inactiv/i.test(key)) {
      inactivity = inactivity ?? interpreted;
      continue;
    }
    if (/max|lifetime|session/i.test(key)) maximum = maximum ?? interpreted;
  }
  const dashboardProofStillRequired = [
    "Clerk Dashboard → Sessions → Maximum lifetime enabled and duration ≤ 14 days (≤ 336 hours) on the identified instance",
    "Inactivity timeout is a separate control and is not maximum-lifetime proof",
    "Session token lifetime (often ~60s) is not maximum-lifetime proof",
    "Default session JWT must still contain sid; a custom jwt_templates list does not prove the default session token",
    "Synthetic or QA-owned logout/replay must show a revoked sid stays rejected. Do not revoke real user sessions",
  ];
  const base = {
    maximumLifetime: maximum,
    inactivityTimeout: inactivity,
    sessionTokenLifetime: token,
    dashboardPath: "Clerk Dashboard → Sessions → Maximum lifetime ≤ 14 days (≤ 336 hours)",
    docs: "https://clerk.com/docs/guides/secure/session-options",
    platformApi: "session_settings (Maximum lifetime). The session config key is session-token lifetime, not this control.",
    productionSettingsChanged: false,
    sessionsRevoked: false,
    localSidRevocationTtlSeconds: 14 * 24 * 3600,
  };
  if (!maximum || maximum.within14d == null) {
    return {
      ...base,
      status: "BLOCKED_API_GAP",
      reason:
        "Clerk docs (read 2026-11-20) place Maximum lifetime on Dashboard Sessions / Platform API session_settings. Backend GET /v1/instance did not yield an interpreted maximum lifetime. HTTP 200, inactivity timeout, and session-token TTL are not R1 proof.",
      dashboardProofStillRequired,
    };
  }
  if (maximum.within14d === true) {
    return {
      ...base,
      status: "BLOCKED_REVOCATION_UNTESTED",
      reason:
        "An interpreted maximum lifetime ≤ 14 days was present. R1 stays open until a synthetic or QA-owned logout/replay shows the revoked sid stays rejected. This job does not revoke sessions.",
      dashboardProofStillRequired: dashboardProofStillRequired.slice(4),
    };
  }
  return {
    ...base,
    status: "MAX_LIFETIME_EXCEEDS_14D",
    reason: "Interpreted maximum lifetime is longer than 14 days (336 hours). Local sid revocation TTL is 14 days and would expire first.",
    dashboardProofStillRequired,
  };
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
  for (const key of Object.keys(raw)) {
    if (/secret|password|api_key/i.test(key) && !(key in out)) out[key] = REDACT;
  }
  return out;
}

export function jwtTemplateEvidence(body) {
  const list = Array.isArray(body) ? body : body?.data;
  if (!Array.isArray(list)) return { shape: "unparsed", count: null, templates: [] };
  return {
    shape: "list",
    count: list.length,
    note: "Custom templates only. An empty list does not prove the default session token lacks sid.",
    templates: list.slice(0, 20).map((template) => {
      const claims = template?.claims && typeof template.claims === "object" && !Array.isArray(template.claims)
        ? Object.keys(template.claims)
        : [];
      return {
        name: typeof template?.name === "string" ? template.name.slice(0, 80) : null,
        lifetime: typeof template?.lifetime === "number" ? template.lifetime : null,
        allowedClockSkew: typeof template?.allowed_clock_skew === "number" ? template.allowed_clock_skew : null,
        claimNames: claims,
        hasSidClaim: claims.includes("sid"),
      };
    }),
  };
}

async function clerkGet(secret, path) {
  const response = await fetch("https://api.clerk.com/v1" + path, {
    headers: {
      Authorization: "Bearer " + secret,
      Accept: "application/json",
      "User-Agent": "PunctumClerkInstanceReadonly/1.1",
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
    schema: 2,
    measuredAt: new Date().toISOString(),
    purpose: "Validate every configured Clerk secret, including CLERK_SECRET_KEY, without printing secret material",
    docs: "https://clerk.com/docs/guides/secure/session-options",
    knownProductionInstanceId: KNOWN_PRODUCTION_INSTANCE_ID,
    secretPresence: {
      PUNCTUM_CLERK_PRODUCTION_SECRET_KEY: present("PUNCTUM_CLERK_PRODUCTION_SECRET_KEY"),
      CLERK_SECRET_KEY: present("CLERK_SECRET_KEY"),
      PUNCTUM_CLERK_PRODUCTION_PUBLISHABLE_KEY: present("PUNCTUM_CLERK_PRODUCTION_PUBLISHABLE_KEY"),
    },
    keyPrefixes: Object.fromEntries(candidates.map((candidate) => [candidate.envName, keyPrefix(candidate.value)])),
    attempts: [],
  };

  const validated = [];
  for (const candidate of candidates) {
    const plan = classifyCredential(candidate.value);
    if (plan.classification === "ABSENT") {
      report.attempts.push({ envName: candidate.envName, result: "ABSENT", classification: "ABSENT", callsBackend: false });
      continue;
    }
    if (!plan.backendCallable) {
      report.attempts.push({
        envName: candidate.envName,
        keyPrefix: plan.prefix,
        classification: "INVALID_BACKEND_SECRET",
        publishable: plan.publishable,
        result: "INVALID_BACKEND_SECRET",
        callsBackend: false,
      });
      continue;
    }
    const result = await clerkGet(candidate.value, "/instance");
    const attempt = {
      envName: candidate.envName,
      http: result.status,
      keyPrefix: plan.prefix,
      classification: plan.classification,
      callsBackend: true,
    };
    if (result.status === 200 && result.body && typeof result.body === "object") {
      attempt.instance = sanitizeInstance(result.body);
      attempt.sessionEvidence = extractSessionEvidence(result.body);
      attempt.result = "VALID";
      attempt.matchesKnownProductionInstance = attempt.instance?.id === KNOWN_PRODUCTION_INSTANCE_ID;
      validated.push({ envName: candidate.envName, value: candidate.value });
    } else if (result.status === 401 || result.status === 403) {
      attempt.result = "INVALID_OR_UNAUTHORIZED";
      attempt.classification = "INVALID_BACKEND_SECRET";
      attempt.clerkErrorCode = result.body?.errors?.[0]?.code ?? null;
    } else {
      attempt.result = "UNEXPECTED_HTTP";
    }
    report.attempts.push(attempt);
  }

  for (const candidate of validated) {
    const probe = await clerkGet(candidate.value, "/jwt_templates");
    report.attempts.push({
      envName: candidate.envName,
      probe: "/jwt_templates",
      http: probe.status,
      jwtTemplates: probe.status === 200 ? jwtTemplateEvidence(probe.body) : null,
      note: "claim names and numeric token lifetime only; template bodies discarded",
    });
  }

  const identities = report.attempts
    .filter((attempt) => attempt.instance?.id)
    .map((attempt) => ({
      envName: attempt.envName,
      instanceId: attempt.instance.id,
      environment_type: attempt.instance.environment_type ?? attempt.instance.environment ?? null,
      matchesKnownProductionInstance: attempt.matchesKnownProductionInstance === true,
    }));
  report.instanceIdentities = identities;
  report.sameInstanceAcrossBackendSecrets = new Set(identities.map((item) => item.instanceId)).size <= 1;

  const clerkAttempt = report.attempts.find((attempt) => attempt.envName === "CLERK_SECRET_KEY" && !attempt.probe);
  report.updatedSecret = {
    name: "CLERK_SECRET_KEY",
    classification: clerkAttempt?.classification ?? "ABSENT",
    publishable: clerkAttempt?.publishable === true,
    http: clerkAttempt?.http ?? null,
    environment_type: clerkAttempt?.instance?.environment_type ?? clerkAttempt?.instance?.environment ?? null,
    instanceId: clerkAttempt?.instance?.id ?? null,
    matchesKnownProductionInstance: clerkAttempt?.matchesKnownProductionInstance === true,
    callsBackend: clerkAttempt?.callsBackend === true,
  };

  const preferred = report.attempts.find((attempt) => attempt.envName === "CLERK_SECRET_KEY" && attempt.sessionEvidence)
    ?? report.attempts.find((attempt) => attempt.sessionEvidence);
  report.r1 = assessR1(preferred?.sessionEvidence?.sessionFields);
  report.r1.sourceEnv = preferred?.envName ?? null;
  report.r1.instanceId = preferred?.instance?.id ?? null;

  const anyValid = report.attempts.some((attempt) => attempt.result === "VALID");
  report.secretNamesValidated = identities.map((item) => item.envName);
  if (anyValid) {
    report.verdict = "INSTANCE_READ_OK";
    report.secretNameUsed = clerkAttempt?.result === "VALID" ? "CLERK_SECRET_KEY" : identities[0]?.envName ?? null;
  } else if (report.secretPresence.PUNCTUM_CLERK_PRODUCTION_SECRET_KEY || report.secretPresence.CLERK_SECRET_KEY) {
    report.verdict = "SECRET_PRESENT_BUT_REJECTED";
  } else {
    report.verdict = "SECRET_MISSING_IN_ACTIONS_CONTEXT";
  }
  if (report.updatedSecret.classification === "INVALID_BACKEND_SECRET") {
    report.updatedSecret.result = "INVALID_BACKEND_SECRET";
  }

  const json = JSON.stringify(report, null, 2) + "\n";
  assertNoSecretMaterial(json);
  process.stdout.write(json);
  if (report.verdict !== "INSTANCE_READ_OK" && report.verdict !== "SECRET_MISSING_IN_ACTIONS_CONTEXT") {
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(JSON.stringify({
      fatal: true,
      name: error?.name,
      message: String(error?.message || error).slice(0, 200),
    }));
    process.exit(1);
  });
}
