// CI (Node 24, private POSIX temp filesystem): node scripts/hostinger-clerk-production-proof.mjs
import assert from "node:assert/strict";
import { randomBytes, createPublicKey } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openCandidateWritableDatabase } from "../services/punctum-hostinger-production/candidate-sqlite.mjs";
import { productionStageApplicationId } from "../services/punctum-hostinger-production/sqlite.mjs";

const ISSUER = "https://clerk.punctumpicture.com";
const ORIGIN = "https://punctumpicture.com";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LIMIT = "handler-only; no browser, deployed HTTP or live database coverage";

export function proofInputs(env) {
  const names = ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "SOURCE_ADMIN_EMAIL", "PUNCTUM_CLERK_ADMIN_EMAIL", "PUNCTUM_CLERK_ADMIN_USER_ID", "PUNCTUM_CLERK_SESSION_ID"];
  assert(names.every((name) => typeof env[name] === "string" && env[name].trim().length > 0));
  const secretKey = env.CLERK_SECRET_KEY;
  const publishableKey = env.CLERK_PUBLISHABLE_KEY;
  assert(/^sk_live_[a-zA-Z0-9]+$/.test(secretKey));
  assert(/^pk_live_[a-zA-Z0-9+/]+={0,2}$/.test(publishableKey));
  assert(Buffer.from(publishableKey.slice(8), "base64").toString("utf8") === new URL(ISSUER).hostname + "$");
  const email = env.SOURCE_ADMIN_EMAIL.trim().toLowerCase();
  const clerkEmail = env.PUNCTUM_CLERK_ADMIN_EMAIL.trim().toLowerCase();
  assert(email.length <= 120 && /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email));
  assert(clerkEmail.length <= 254 && /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(clerkEmail));
  const userId = env.PUNCTUM_CLERK_ADMIN_USER_ID;
  const sessionId = env.PUNCTUM_CLERK_SESSION_ID;
  assert(/^user_[a-zA-Z0-9_-]{3,180}$/.test(userId));
  assert(/^sess_[a-zA-Z0-9_-]{3,180}$/.test(sessionId));
  return { secretKey, publishableKey, email, clerkEmail, userId, sessionId };
}

export function assertSelectedIdentity(input, user, session) {
  assert(user.id === input.userId && user.password_enabled === true);
  assert(user.banned === false && user.locked === false);
  assert(typeof user.primary_email_address_id === "string");
  const primary = user.email_addresses.filter((email) => email.id === user.primary_email_address_id);
  assert(primary.length === 1);
  assert(primary[0].email_address.trim().toLowerCase() === input.clerkEmail, "CLERK_SELECTED_EMAIL_MISMATCH");
  assert(primary[0].verification?.status === "verified");
  assert(session.id === input.sessionId && session.user_id === input.userId);
  assert(session.status === "active" && session.expire_at > Date.now() && session.abandon_at > Date.now());
  assert(/^client_[a-zA-Z0-9_-]+$/.test(session.client_id));
  assert(Number.isSafeInteger(session.last_active_at) && session.last_active_at > 0 && session.last_active_at <= Date.now());
  assert(session.actor == null);
}

export async function loadAuthHandlers() {
  const { build } = await import("esbuild");
  const bundled = await build({
    stdin: {
      contents: `export { handleAdminAuth } from "./worker/api/admin-auth.ts";
        export { requireAdmin, setAdminPassword } from "./worker/utils/auth.ts";
        export { handleClientSessionApi } from "./worker/api/client-session.ts";
        export { requireClient } from "./worker/client/auth.ts";
        export { verifyClerkSessionFromRequest } from "./worker/auth/clerk-auth.ts";`,
      resolveDir: ROOT,
    },
    bundle: true, platform: "node", format: "esm", target: "node24", write: false, logLevel: "silent",
  });
  return import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
}

export async function withProofDatabase(run) {
  const base = realpathSync(tmpdir());
  const directory = mkdtempSync(join(base, "punctum-real-clerk-proof-"));
  let db;
  const previousMode = process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE;
  const cleanup = () => {
    try { db?.close(); } finally {
      db = undefined;
      assert(dirname(resolve(directory)) === base && dirname(realpathSync(directory)) === base);
      rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
      assert(!existsSync(directory));
    }
  };
  const interrupt = () => { cleanup(); process.exit(130); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    chmodSync(directory, 0o700);
    assert((statSync(directory).mode & 0o077) === 0);
    const path = join(directory, "proof.sqlite");
    closeSync(openSync(path, "wx", 0o600));
    chmodSync(path, 0o600);
    const sqlite = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    try {
      sqlite.exec(`PRAGMA application_id = ${productionStageApplicationId}`);
      for (const name of readdirSync(join(ROOT, "migrations")).filter((name) => name.endsWith(".sql")).sort()) {
        sqlite.exec(readFileSync(join(ROOT, "migrations", name), "utf8"));
      }
    } finally { sqlite.close(); }
    process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE = "private-candidate";
    db = openCandidateWritableDatabase(path, { candidateMode: "PRIVATE_PRODUCTION_CANDIDATE" });
    return await run(db, { dbFile: path, directory });
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    try { cleanup(); } finally {
      if (previousMode === undefined) delete process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE;
      else process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE = previousMode;
    }
  }
}

export async function bindApprovedAdmin(db, input) {
  assert(!await db.prepare("SELECT clerk_user_id FROM clerk_pilot_identity_links WHERE clerk_user_id=?").bind(input.userId).first());
  const existing = await db.prepare("SELECT admin_principal_id,role,disabled_at FROM clerk_admin_identity_links WHERE clerk_user_id=?").bind(input.userId).first();
  if (existing) {
    assert(existing.admin_principal_id === input.email && existing.role === "admin" && existing.disabled_at === null);
    return { created: false };
  }
  assert(!await db.prepare("SELECT clerk_user_id FROM clerk_admin_identity_links WHERE admin_principal_id=?").bind(input.email).first());
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO clerk_admin_identity_links
      (clerk_user_id,admin_principal_id,role,session_version,created_at,updated_at) VALUES (?,?,'admin',1,?,?)`)
      .bind(input.userId, input.email, now, now),
    db.prepare(`INSERT INTO audit_log (id,actor_email,action,entity_type,entity_id,data_json,created_at)
      VALUES (?,'operator-approved-clerk-admin','admin.clerk_identity_linked','admin',?,NULL,?)`)
      .bind(crypto.randomUUID(), input.userId, now),
  ]);
  return { created: true };
}

export async function proveHandlers(auth, db, input, jwt, pem, checks) {
  const env = {
    DB: db, ENVIRONMENT: "production", SITE_ORIGIN: ORIGIN, PUBLIC_SITE_URL: ORIGIN,
    ADMIN_AUTH_MODE: "clerk", CLIENT_AUTH_MODE: "clerk", CLERK_AUTH_ENABLED: "true",
    ADMIN_ALLOWED_EMAILS: input.email, CLERK_ISSUER: ISSUER,
    CLERK_PUBLISHABLE_KEY: input.publishableKey, CLERK_JWT_KEY: pem, CLERK_SECRET_KEY: input.secretKey,
    ADMIN_SESSION_SECRET: randomBytes(48).toString("hex"), CLIENT_SESSION_SECRET: randomBytes(48).toString("hex"),
  };
  const request = (path, method = "GET", headers = {}, body) => new Request(ORIGIN + path, {
    method, headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const bearer = { authorization: "Bearer " + jwt };
  const login = () => {
    const req = request("/admin/api/clerk-session", "POST", bearer);
    return auth.handleAdminAuth(req, new URL(req.url), env);
  };
  const denied = (run, code, status) => assert.rejects(run, (error) => error.code === code && error.status === status);
  const verified = await auth.verifyClerkSessionFromRequest(request("/admin/api/clientes", "GET", bearer), env);
  assert(verified?.clerkUserId === input.userId && verified?.sessionId === input.sessionId);
  checks.realJwtVerifiedByWorker = true;
  await denied(login, "ADMIN_UNAUTHORIZED", 403);
  assert(await db.prepare("SELECT count(*) AS n FROM clerk_admin_identity_links").first("n") === 0);
  checks.unlinkedDenied = true;

  await bindApprovedAdmin(db, input);
  const response = await login();
  assert(response?.status === 200 && (await response.json()).authSource === "clerk");
  const setCookie = response.headers.get("set-cookie");
  assert(setCookie?.startsWith("punctum_admin_session=") && /; HttpOnly(?:;|$)/i.test(setCookie) && /; Secure(?:;|$)/i.test(setCookie) && /; SameSite=Strict(?:;|$)/i.test(setCookie));
  const cookie = { cookie: setCookie.split(";")[0] };
  for (const headers of [bearer, cookie]) {
    const identity = await auth.requireAdmin(request("/admin/api/clientes", "GET", headers), env);
    assert(identity.email === input.email && identity.authSource === "clerk" && identity.clerkUserId === input.userId);
  }
  checks.linkedAdminSucceeded = checks.secureCookie = true;

  await denied(() => auth.requireAdmin(request("/admin/api/clientes", "GET", bearer), { ...env, ADMIN_ALLOWED_EMAILS: "denied@example.invalid" }), "ADMIN_UNAUTHORIZED", 403);
  const clientRequest = request("/api/client/clerk-session", "POST", bearer);
  await denied(() => auth.handleClientSessionApi(clientRequest, new URL(clientRequest.url), env), "CLIENT_CLERK_UNLINKED", 403);
  await denied(() => auth.requireClient(request("/api/client/me", "GET", cookie), env, db), "CLIENT_UNAUTHORIZED", 401);
  checks.roleAndClientDenied = true;

  const parts = jwt.split(".");
  const signature = Buffer.from(parts[2], "base64url");
  signature[0] ^= 1;
  const tampered = { authorization: "Bearer " + parts.slice(0, 2).join(".") + "." + signature.toString("base64url") };
  assert(await auth.verifyClerkSessionFromRequest(request("/admin/api/clientes", "GET", tampered), env) === null);
  await denied(() => auth.requireAdmin(request("/admin/api/clientes", "GET", tampered), env), "ADMIN_UNAUTHORIZED", 403);
  checks.tamperedSignatureDenied = true;

  // Logout revokes only this disposable SQLite state, never the live Clerk session.
  const logoutRequest = request("/admin/api/session", "DELETE", cookie);
  const logout = await auth.handleAdminAuth(logoutRequest, new URL(logoutRequest.url), env);
  assert(logout?.status === 200 && logout.headers.get("set-cookie")?.includes("Max-Age=0"));
  assert(await db.prepare("SELECT session_version FROM clerk_admin_identity_links WHERE clerk_user_id=?").bind(input.userId).first("session_version") === 2);
  for (const headers of [cookie, bearer]) {
    await denied(() => auth.requireAdmin(request("/admin/api/clientes", "GET", headers), env), "ADMIN_UNAUTHORIZED", 403);
  }
  await denied(login, "ADMIN_UNAUTHORIZED", 403);
  checks.logoutAndReplayDenied = true;

  const legacy = { ...env, ADMIN_AUTH_MODE: "legacy", CLIENT_AUTH_MODE: "password", CLERK_AUTH_ENABLED: "false" };
  const password = randomBytes(24).toString("hex");
  await auth.setAdminPassword(password, db, "proof@example.invalid");
  const legacyRequest = request("/admin/api/session", "POST", {}, { email: input.email, password });
  const legacyResponse = await auth.handleAdminAuth(legacyRequest, new URL(legacyRequest.url), legacy);
  assert(legacyResponse?.status === 200);
  const legacyCookie = { cookie: legacyResponse.headers.get("set-cookie").split(";")[0] };
  assert((await auth.requireAdmin(request("/admin/api/clientes", "GET", legacyCookie), legacy)).authSource === "shared-password");
  await denied(() => auth.requireAdmin(request("/admin/api/clientes", "GET", legacyCookie), env), "ADMIN_UNAUTHORIZED", 403);
  checks.legacyFallbackSucceeded = true;
}

export async function selectedClerkSession(input, checks = {}) {
  const bapi = async (path, method = "GET") => {
    const response = await fetch("https://api.clerk.com/v1" + path, {
      method, headers: { authorization: "Bearer " + input.secretKey, "content-type": "application/json" },
      ...(method === "POST" ? { body: "{}" } : {}),
      redirect: "error", signal: AbortSignal.timeout(15_000),
    });
    assert(response.ok);
    return response.json();
  };
  const user = await bapi("/users/" + input.userId);
  const session = await bapi("/sessions/" + input.sessionId);
  assertSelectedIdentity(input, user, session);
  checks.selectedIdentityVerified = true;
  const response = await fetch(ISSUER + "/.well-known/jwks.json", { redirect: "error", signal: AbortSignal.timeout(15_000) });
  assert(response.ok);
  const jwks = await response.json();
  const issued = await bapi("/sessions/" + input.sessionId + "/tokens", "POST");
  const jwt = process.env.PUNCTUM_CLERK_BROWSER_SESSION_JWT || issued.jwt;
  assert(typeof jwt === "string" && jwt.split(".").length === 3);
  const { decodeProtectedHeader, jwtVerify } = await import("jose");
  const header = decodeProtectedHeader(jwt);
  assert(header.alg === "RS256" && typeof header.kid === "string");
  const matching = jwks.keys.filter((key) => key.kid === header.kid && key.kty === "RSA" && (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256"));
  assert(matching.length === 1 && !matching[0].d);
  const key = createPublicKey({ key: matching[0], format: "jwk" });
  const { payload } = await jwtVerify(jwt, key, { issuer: ISSUER, subject: input.userId, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "sid"] });
  assert(payload.sid === input.sessionId && !payload.act && (payload.azp === undefined || payload.azp === ORIGIN));
  checks.liveKeyMatchesIssuer = true;
  return { jwt, pem: key.export({ format: "pem", type: "spki" }).toString(), browserOriginPresent: payload.azp === ORIGIN };
}

async function main() {
  let stage = "inputs";
  const checks = {};
  try {
    const input = proofInputs(process.env);
    stage = "bundle";
    const auth = await loadAuthHandlers();
    stage = "private-sqlite";
    await withProofDatabase(async (db) => {
      stage = "identity-and-active-browser-session";
      const { jwt, pem, browserOriginPresent } = await selectedClerkSession(input, checks);
      stage = "browser-origin-token-required";
      assert(browserOriginPresent, "CLERK_BROWSER_ORIGIN_TOKEN_REQUIRED");
      stage = "handlers";
      await proveHandlers(auth, db, input, jwt, pem, checks);
      stage = "cleanup";
    });
    checks.temporaryDatabaseRemoved = true;
    console.log(JSON.stringify({ status: "passed", checks, limit: LIMIT }));
  } catch (error) {
    // Never emit upstream errors, assertion values, JWTs, user data or key material.
    const reason = /^CLERK_[A-Z_]+$/.test(error?.message ?? "") ? error.message : undefined;
    console.log(JSON.stringify({ status: stage === "inputs" || stage === "browser-origin-token-required" ? "blocked" : "failed", stage, reason, checks, limit: LIMIT }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
