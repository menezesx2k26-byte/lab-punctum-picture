// Linux CI, Node 24: build:hostinger:candidate, playwright install chromium, then run this file.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, createPublicKey, randomBytes, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:https";
import { createServer as createSocketServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { assertSelectedIdentity, bindApprovedAdmin, proofInputs, withProofDatabase } from "./hostinger-clerk-production-proof.mjs";

const ORIGIN = "https://punctumpicture.com";
const ISSUER = "https://clerk.punctumpicture.com";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LIMIT = "real-production-Clerk+isolated-application; ticket login, not password/MFA proof; public Hostinger TLS NOT covered";

export function browserArgs(spki) {
  assert(/^[A-Za-z0-9+/]{43}=$/.test(spki));
  return ["--host-resolver-rules=MAP punctumpicture.com:443 127.0.0.1:8443", "--ignore-certificate-errors-spki-list=" + spki, "--no-proxy-server", "--disable-quic"];
}

export function allowedBrowserUrl(raw) {
  const url = new URL(raw);
  return url.protocol === "https:" && !url.username && !url.password && !url.port &&
    [ORIGIN, ISSUER, "https://accounts.punctumpicture.com"].includes(url.origin);
}

export function assertTestSession(id, input) {
  assert(typeof id === "string" && /^sess_[a-zA-Z0-9_-]{3,180}$/.test(id) && id !== input.sessionId);
}

export async function verifyBrowserJwt(jwt, jwks, input, sessionId) {
  assertTestSession(sessionId, input);
  const { decodeProtectedHeader, jwtVerify } = await import("jose");
  const header = decodeProtectedHeader(jwt);
  assert(header.alg === "RS256" && typeof header.kid === "string");
  const keys = jwks.keys.filter((key) => key.kid === header.kid && key.kty === "RSA" && !key.d && (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256"));
  assert(keys.length === 1);
  const key = createPublicKey({ key: keys[0], format: "jwk" });
  const { payload } = await jwtVerify(jwt, key, { issuer: ISSUER, subject: input.userId, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "sid", "azp"] });
  assert(payload.sid === sessionId && payload.azp === ORIGIN && !payload.act);
  return key.export({ format: "pem", type: "spki" }).toString();
}

export async function cleanupClerk(bapi, input, owned) {
  let failed = false;
  if (owned.sessionId) {
    try {
      assertTestSession(owned.sessionId, input);
      const session = await bapi("/sessions/" + owned.sessionId);
      assert(session.id === owned.sessionId && session.user_id === input.userId && !session.actor);
      if (session.status === "active") await bapi("/sessions/" + owned.sessionId + "/revoke", {});
      assert((await bapi("/sessions/" + owned.sessionId)).status !== "active");
    } catch { failed = true; }
  }
  if (owned.ticketId && !owned.sessionId) {
    try {
      assert(/^sit_[a-zA-Z0-9_-]+$/.test(owned.ticketId));
      assert((await bapi("/sign_in_tokens/" + owned.ticketId + "/revoke", {})).status === "revoked");
    } catch { failed = true; }
  }
  assert(!failed, "PROOF_CLEANUP_FAILED");
}

export async function startTlsProxy(directory) {
  const key = join(directory, "loopback-key.pem");
  const cert = join(directory, "loopback-cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=punctumpicture.com", "-addext", "subjectAltName=DNS:punctumpicture.com", "-keyout", key, "-out", cert], { stdio: "ignore", timeout: 15_000 });
  const certificate = readFileSync(cert);
  const spki = createHash("sha256").update(new X509Certificate(certificate).publicKey.export({ type: "spki", format: "der" })).digest("base64");
  const proxy = createServer({ key: readFileSync(key), cert: certificate }, (req, res) => {
    if (req.headers.host !== "punctumpicture.com" || !req.url?.startsWith("/") || req.url.startsWith("//")) { res.writeHead(421).end(); return; }
    const upstream = httpRequest({ hostname: "127.0.0.1", port: 3025, path: req.url, method: req.method,
      headers: { ...req.headers, host: "punctumpicture.com", "x-forwarded-host": "punctumpicture.com", "x-forwarded-proto": "https", "x-real-ip": "127.0.0.1", "x-forwarded-for": "127.0.0.1" },
    }, (reply) => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  });
  await new Promise((done, fail) => { proxy.once("error", fail); proxy.listen(8443, "127.0.0.1", done); });
  return { proxy, spki };
}

async function startApp(env) {
  await new Promise((done, fail) => {
    const probe = createSocketServer();
    probe.once("error", fail);
    probe.listen(3025, "127.0.0.1", () => probe.close(done));
  });
  const child = spawn(process.execPath, [join(ROOT, "services/punctum-hostinger-production/candidate-server.mjs")], { cwd: ROOT, env, stdio: "ignore" });
  let failed = false;
  child.once("error", () => { failed = true; });
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      assert(!failed && child.exitCode === null);
      try {
        const response = await fetch("http://127.0.0.1:3025/api/health", { redirect: "error", signal: AbortSignal.timeout(500) });
        if (response.ok) return child;
      } catch { /* The local process may still be starting. */ }
      await delay(500);
    }
    throw Error("PROOF_APP_START_FAILED");
  } catch (error) { await stopApp(child); throw error; }
}

async function stopApp(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try { await closed; } finally { clearTimeout(timer); }
}

async function browserPost(page, path, jwt, body) {
  assert(path.startsWith("/") && !path.startsWith("//"));
  return page.evaluate(async ({ path, jwt, body }) => {
    const response = await fetch(path, { method: "POST", credentials: "same-origin", redirect: "error",
      headers: { "content-type": "application/json", ...(jwt ? { authorization: "Bearer " + jwt } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response.status;
  }, { path, jwt, body });
}

export async function invalidOriginStatus(context, jwt) {
  // APIRequestContext does not inherit Chromium's DNS mapping or SPKI pin.
  const response = await context.request.post("http://127.0.0.1:3025/admin/api/clerk-session", {
    headers: { host: "punctumpicture.com", "x-forwarded-proto": "https", origin: "https://invalid.example", authorization: "Bearer " + jwt },
    data: {}, maxRedirects: 0,
  });
  try { return response.status(); } finally { await response.dispose(); }
}

async function main() {
  let stage = "inputs";
  const checks = {};
  const http = {};
  const expectHttp = (status, expected) => {
    assert(Number.isInteger(status) && status >= 100 && status <= 599);
    http[stage] = status;
    assert(status === expected);
  };
  try {
    const input = proofInputs(process.env);
    assert(process.platform === "linux" && !process.env.DEBUG && !process.env.PWDEBUG && !process.env.NODE_TLS_REJECT_UNAUTHORIZED);
    assert(existsSync(join(ROOT, "dist/hostinger-candidate/server/index.js")));
    const { chromium } = await import("playwright");
    const bapi = async (path, body) => {
      const response = await fetch("https://api.clerk.com/v1" + path, {
        method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { authorization: "Bearer " + input.secretKey, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert(response.ok);
      return response.json();
    };
    stage = "private-database";
    const signals = ["SIGINT", "SIGTERM"];
    const priorListeners = signals.map((signal) => process.listeners(signal));
    await withProofDatabase(async (db, { dbFile, directory }) => {
      let browser, proxy, app;
      const owned = {};
      let interrupted = false;
      const interrupt = () => { interrupted = true; void browser?.close().catch(() => {}); };
      // Let async session cleanup finish before the database helper removes private files.
      signals.forEach((signal, index) => {
        for (const listener of process.listeners(signal)) if (!priorListeners[index].includes(listener)) process.removeListener(signal, listener);
        process.on(signal, interrupt);
      });
      const deadline = setTimeout(interrupt, 180_000);
      try {
        stage = "selected-identity";
        const user = await bapi("/users/" + input.userId);
        const original = await bapi("/sessions/" + input.sessionId);
        assertSelectedIdentity(input, user, original);
        stage = "selected-identity-mfa-policy";
        assert(user.two_factor_enabled === false, "PROOF_MFA_REQUIRES_INTERACTIVE_LOGIN");
        checks.approvedIdentityAndOriginalSession = true;
        stage = "issuer-jwks";
        const response = await fetch(ISSUER + "/.well-known/jwks.json", { redirect: "error", signal: AbortSignal.timeout(15_000) });
        assert(response.ok);
        const jwks = await response.json();
        const key = jwks.keys.find((key) => key.kty === "RSA" && !key.d && (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256"));
        assert(key);
        const pem = createPublicKey({ key, format: "jwk" }).export({ type: "spki", format: "pem" }).toString();
        for (const name of ["originals", "backups"]) mkdirSync(join(directory, name), { mode: 0o700 });
        const password = randomBytes(32).toString("hex");
        const env = {
          PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: directory, NODE_ENV: "production", PORT: "3025",
          PUNCTUM_PRODUCTION_CANDIDATE_MODE: "private-candidate", PUNCTUM_CANDIDATE_ENVIRONMENT: "staging",
          PUNCTUM_CANDIDATE_PROVIDER: "hostinger-managed", PUNCTUM_CANDIDATE_PUBLIC_URL: ORIGIN,
          PUNCTUM_CANDIDATE_DB_FILE: dbFile, PUNCTUM_CANDIDATE_ORIGINALS: join(directory, "originals"), PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(directory, "backups"),
          PUNCTUM_CANDIDATE_ADMIN_EMAIL: input.email, PUNCTUM_CANDIDATE_ADMIN_PASSWORD_HASH: createHash("sha256").update(password).digest("hex"),
          PUNCTUM_CANDIDATE_ADMIN_SESSION_SECRET: randomBytes(48).toString("hex"), PUNCTUM_CANDIDATE_CLIENT_SESSION_SECRET: randomBytes(48).toString("hex"),
          PUNCTUM_CANDIDATE_ADMIN_AUTH_MODE: "hybrid", PUNCTUM_CANDIDATE_CLIENT_AUTH_MODE: "password", PUNCTUM_CANDIDATE_CLERK_AUTH_ENABLED: "true",
          CLERK_SECRET_KEY: input.secretKey, CLERK_PUBLISHABLE_KEY: input.publishableKey, CLERK_JWT_KEY: pem, CLERK_ISSUER: ISSUER,
        };
        stage = "isolated-app-and-tls";
        app = await startApp(env);
        const tls = await startTlsProxy(directory);
        proxy = tls.proxy;
        assert(!interrupted);
        browser = await chromium.launch({ headless: true, args: browserArgs(tls.spki), env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory } });
        const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
        await context.route("**/*", (route) => allowedBrowserUrl(route.request().url()) ? route.continue() : route.abort());
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        stage = "canonical-access-status";
        const access = await page.goto(ORIGIN + "/acesso", { waitUntil: "domcontentloaded" });
        expectHttp(access?.status(), 200);
        stage = "canonical-access-loopback-address";
        assert((await access.serverAddr())?.ipAddress === "127.0.0.1");
        stage = "clerk-provider-loaded";
        await page.waitForFunction(() => window.Clerk?.loaded && window.Clerk.client?.signIn);
        checks.canonicalOriginLoopbackAndPinnedTls = true;
        await page.exposeFunction("__punctumProofSession", (id) => {
          assertTestSession(id, input);
          assert(!owned.sessionId || owned.sessionId === id);
          owned.sessionId = id;
        });
        stage = "one-time-ticket-login";
        assert(!interrupted);
        const ticket = await bapi("/sign_in_tokens", { user_id: input.userId, expires_in_seconds: 120, honor_lockout: true });
        owned.ticketId = ticket.id;
        assert(/^sit_[a-zA-Z0-9_-]+$/.test(ticket.id) && typeof ticket.token === "string" && ticket.user_id === input.userId);
        assert(!interrupted);
        const loggedIn = await page.evaluate(async ({ ticket, userId }) => {
          const clerk = window.Clerk;
          const result = await clerk.client.signIn.create({ strategy: "ticket", ticket });
          if (result.createdSessionId) await window.__punctumProofSession(result.createdSessionId);
          if (result.status !== "complete" || !result.createdSessionId) return false;
          await clerk.setActive({ session: result.createdSessionId });
          return clerk.user?.id === userId && clerk.session?.id === result.createdSessionId;
        }, { ticket: ticket.token, userId: input.userId });
        stage = "sdk-ticket-login-complete";
        assert(loggedIn && owned.sessionId);
        const created = await bapi("/sessions/" + owned.sessionId);
        stage = "created-test-session-identity";
        assertSelectedIdentity({ ...input, sessionId: owned.sessionId }, user, created);
        stage = "created-test-session-isolation";
        assert(created.created_at >= original.last_active_at && created.client_id !== original.client_id);
        stage = "sdk-session-token";
        const jwt = await page.evaluate(() => window.Clerk.session.getToken({ skipCache: true }));
        stage = "sdk-token-canonical-azp";
        assert(await verifyBrowserJwt(jwt, jwks, input, owned.sessionId) === pem);
        checks.realSdkTicketLoginAndCanonicalAzp = true;
        stage = "unlinked-admin-exchange";
        expectHttp(await browserPost(page, "/admin/api/clerk-session", jwt), 403);
        stage = "unlinked-admin-binding-absent";
        assert(await db.prepare("SELECT count(*) AS n FROM clerk_admin_identity_links").first("n") === 0);
        checks.unlinkedDenied = true;
        stage = "explicit-admin-binding";
        await bindApprovedAdmin(db, input);
        stage = "linked-admin-exchange";
        expectHttp(await browserPost(page, "/admin/api/clerk-session", jwt), 200);
        stage = "linked-admin-secure-cookie";
        const cookie = (await context.cookies(ORIGIN + "/admin")).find((cookie) => cookie.name === "punctum_admin_session");
        assert(cookie?.secure && cookie.httpOnly && cookie.sameSite === "Strict" && cookie.path === "/admin");
        stage = "linked-admin-studio-status";
        const studio = await page.goto(ORIGIN + "/admin/studio", { waitUntil: "domcontentloaded" });
        expectHttp(studio?.status(), 200);
        stage = "linked-admin-studio-location";
        assert(page.url() === ORIGIN + "/admin/studio");
        stage = "linked-admin-studio-render";
        await page.getByRole("navigation", { name: "Painel" }).waitFor();
        checks.linkedAdminStudioAndSecureCookie = true;
        stage = "unlinked-client-exchange";
        expectHttp(await browserPost(page, "/api/client/clerk-session", jwt), 403);
        checks.clientDenied = true;
        stage = "invalid-origin-exchange";
        expectHttp(await invalidOriginStatus(context, jwt), 403);
        checks.invalidOriginDenied = true;
        stage = "logout-status";
        expectHttp(await page.evaluate(async () => (await fetch("/admin/api/session", { method: "DELETE" })).status), 200);
        stage = "logout-cookie-cleared";
        assert(!(await context.cookies(ORIGIN + "/admin")).some((cookie) => cookie.name === "punctum_admin_session"));
        stage = "jwt-replay-exchange";
        expectHttp(await browserPost(page, "/admin/api/clerk-session", jwt), 403);
        stage = "cookie-replay-admin";
        await context.addCookies([cookie]);
        expectHttp(await browserPost(page, "/admin/api/clientes", undefined, {}), 403);
        await context.clearCookies({ name: "punctum_admin_session" });
        checks.logoutCookieAndJwtReplayDenied = true;
        stage = "legacy-server-restart";
        await stopApp(app);
        app = await startApp({ ...env, PUNCTUM_CANDIDATE_ADMIN_AUTH_MODE: "legacy", PUNCTUM_CANDIDATE_CLERK_AUTH_ENABLED: "false" });
        stage = "legacy-password-login";
        expectHttp(await browserPost(page, "/admin/api/session", undefined, { email: input.email, password }), 200);
        stage = "legacy-studio-status";
        expectHttp((await page.goto(ORIGIN + "/admin/studio", { waitUntil: "domcontentloaded" }))?.status(), 200);
        stage = "legacy-studio-location";
        assert(page.url() === ORIGIN + "/admin/studio");
        stage = "legacy-binding-preserved";
        assert((await bindApprovedAdmin(db, input)).created === false);
        checks.legacyFallbackAndLinkPreserved = true;
        stage = "proof-not-interrupted";
        assert(!interrupted);
      } finally {
        const proofStage = stage;
        stage = "cleanup";
        clearTimeout(deadline);
        // Close the browser before revocation so its SDK cannot refresh the test session.
        let failed = false;
        try { await browser?.close(); } catch { failed = true; }
        try { await cleanupClerk(bapi, input, owned); checks.ownedTicketAndSessionCleaned = true; } catch { failed = true; }
        try { const original = await bapi("/sessions/" + input.sessionId); assert(original.status === "active" && original.user_id === input.userId); checks.originalSessionPreserved = true; } catch { failed = true; }
        try { if (proxy) { proxy.closeAllConnections(); await new Promise((done) => proxy.close(done)); } } catch { failed = true; }
        try { await stopApp(app); } catch { failed = true; }
        signals.forEach((signal) => process.removeListener(signal, interrupt));
        assert(!failed, "PROOF_CLEANUP_FAILED");
        stage = proofStage;
      }
    });
    checks.privateFilesRemoved = true;
    console.log(JSON.stringify({ status: "passed", checks, http, limit: LIMIT }));
  } catch (error) {
    const code = /^PROOF_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "PROOF_CHECK_FAILED";
    console.log(JSON.stringify({ status: stage === "inputs" ? "blocked" : "failed", stage, code, checks, http, limit: LIMIT }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
