import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, chmodSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { request } from "node:https";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { allowedBrowserUrl, assertTestSession, browserArgs, cleanupClerk, startTlsProxy, verifyBrowserJwt } from "./hostinger-clerk-browser-proof.mjs";
import { withProofDatabase } from "./hostinger-clerk-production-proof.mjs";

const input = { userId: "user_approved", sessionId: "sess_owner" };

test("transport confines only the canonical application to loopback, with one certificate pin", () => {
  const args = browserArgs(Buffer.alloc(32).toString("base64"));
  assert(args.includes("--host-resolver-rules=MAP punctumpicture.com:443 127.0.0.1:8443"));
  assert(!args.includes("--ignore-certificate-errors") && !args.some((arg) => arg.includes("MAP *")));
  assert.throws(() => browserArgs("untrusted"));
  for (const origin of ["https://punctumpicture.com/acesso", "https://clerk.punctumpicture.com/v1/client", "https://accounts.punctumpicture.com/"]) assert(allowedBrowserUrl(origin));
  for (const origin of ["http://punctumpicture.com/", "https://punctumpicture.com:8443/", "https://www.punctumpicture.com/", "https://clerk.punctumpicture.com.evil.invalid/", "https://user@punctumpicture.com/", "https://example.invalid/"]) assert(!allowedBrowserUrl(origin));
});

test("cleanup revokes only the captured new session and checks its selected owner", async () => {
  const calls = [];
  let status = "active";
  const bapi = async (path, body) => {
    calls.push([path, body === undefined ? "GET" : "POST"]);
    if (body) status = "revoked";
    return { id: "sess_test", user_id: input.userId, status, actor: null };
  };
  await cleanupClerk(bapi, input, { sessionId: "sess_test", ticketId: "sit_owned" });
  assert.deepEqual(calls, [["/sessions/sess_test", "GET"], ["/sessions/sess_test/revoke", "POST"], ["/sessions/sess_test", "GET"]]);
  calls.length = 0;
  await assert.rejects(() => cleanupClerk(bapi, input, { sessionId: input.sessionId }));
  assert.deepEqual(calls, []);
  assert.throws(() => assertTestSession("sess_test/revoke", input));
  await assert.rejects(() => cleanupClerk(async (path, body) => {
    assert.equal(body, undefined);
    return { id: "sess_test", user_id: "user_other", status: "active" };
  }, input, { sessionId: "sess_test" }));
  const pending = [];
  await cleanupClerk(async (path, body) => { pending.push([path, body]); return { status: "revoked" }; }, input, { ticketId: "sit_owned" });
  assert.deepEqual(pending, [["/sign_in_tokens/sit_owned/revoke", {}]]);
  await assert.rejects(() => cleanupClerk(async () => { throw Error("unavailable"); }, input, { sessionId: "sess_test" }));
});

test("offline signed fixture rejects absent/wrong azp, subject, session and tampered signatures", async () => {
  const { exportJWK, generateKeyPair, SignJWT } = await import("jose");
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwks = { keys: [{ ...await exportJWK(publicKey), kid: "fixture" }] };
  const sign = (claims = {}, subject = input.userId) => new SignJWT({ sid: "sess_test", azp: "https://punctumpicture.com", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" }).setSubject(subject).setIssuer("https://clerk.punctumpicture.com")
    .setIssuedAt().setExpirationTime("1m").sign(privateKey);
  const jwt = await sign();
  assert((await verifyBrowserJwt(jwt, jwks, input, "sess_test")).includes("BEGIN PUBLIC KEY"));
  for (const claims of [{ azp: undefined }, { azp: "https://other.invalid" }, { sid: input.sessionId }, { act: { sub: "user_other" } }]) {
    const invalid = await sign(claims);
    await assert.rejects(() => verifyBrowserJwt(invalid, jwks, input, "sess_test"));
  }
  const otherUser = await sign({}, "user_other");
  await assert.rejects(() => verifyBrowserJwt(otherUser, jwks, input, "sess_test"));
  const parts = jwt.split(".");
  const signature = Buffer.from(parts[2], "base64url");
  signature[0] ^= 1;
  await assert.rejects(() => verifyBrowserJwt(parts.slice(0, 2).join(".") + "." + signature.toString("base64url"), jwks, input, "sess_test"));
});

test("private database exposes its own paths without changing the first callback argument", { skip: process.platform === "win32" }, async () => {
  let directory;
  await withProofDatabase(async (db, metadata) => {
    directory = metadata.directory;
    assert.equal(dirname(metadata.dbFile), directory);
    assert(existsSync(metadata.dbFile));
    assert.equal(await db.prepare("SELECT count(*) AS n FROM clerk_admin_identity_links").first("n"), 0);
  });
  assert(!existsSync(directory));
});

test("missing runtime inputs return safe blocked status before browser or network work", () => {
  const env = { ...process.env };
  for (const name of ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "SOURCE_ADMIN_EMAIL", "PUNCTUM_CLERK_ADMIN_EMAIL", "PUNCTUM_CLERK_ADMIN_USER_ID", "PUNCTUM_CLERK_SESSION_ID"]) delete env[name];
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("./hostinger-clerk-browser-proof.mjs", import.meta.url))], { env, encoding: "utf8" });
  assert.equal(run.status, 1);
  const result = JSON.parse(run.stdout);
  assert.equal(result.status, "blocked");
  assert.equal(result.stage, "inputs");
  assert.deepEqual(result.checks, {});
  assert(result.limit.includes("public Hostinger TLS NOT covered"));
  assert(!run.stderr.includes("Error:"));
});

test("real local browser preserves canonical origin through the pinned loopback proxy (transport fixture only)", async () => {
  const base = realpathSync(tmpdir());
  const directory = mkdtempSync(join(base, "punctum-browser-transport-"));
  chmodSync(directory, 0o700);
  let server, proxy, browser;
  try {
    server = createServer((req, res) => {
      assert.equal(req.headers.host, "punctumpicture.com");
      assert.equal(req.headers["x-forwarded-proto"], "https");
      res.setHeader("content-type", "text/html");
      res.setHeader("set-cookie", "fixture=local; Path=/; Secure; HttpOnly; SameSite=Strict");
      res.end("<!doctype html><title>Local transport fixture</title>");
    });
    await new Promise((done, fail) => { server.once("error", fail); server.listen(3025, "127.0.0.1", done); });
    const tls = await startTlsProxy(directory);
    proxy = tls.proxy;
    browser = await chromium.launch({ headless: true, args: browserArgs(tls.spki) });
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    const response = await page.goto("https://punctumpicture.com/acesso");
    assert.equal(response.status(), 200);
    assert.equal((await response.serverAddr()).ipAddress, "127.0.0.1");
    assert.equal(await page.evaluate(() => location.origin), "https://punctumpicture.com");
    assert.equal(await page.evaluate(() => document.cookie), "");
    assert((await context.cookies()).some((cookie) => cookie.name === "fixture" && cookie.secure && cookie.httpOnly && cookie.sameSite === "Strict"));
    const wrongHost = await new Promise((done, fail) => {
      const req = request({ hostname: "127.0.0.1", port: 8443, servername: "punctumpicture.com", ca: readFileSync(join(directory, "loopback-cert.pem")), headers: { host: "other.invalid" } }, (res) => { res.resume(); done(res.statusCode); });
      req.on("error", fail); req.end();
    });
    assert.equal(wrongHost, 421);
  } finally {
    await browser?.close();
    if (proxy) { proxy.closeAllConnections(); await new Promise((done) => proxy.close(done)); }
    if (server) { server.closeAllConnections(); await new Promise((done) => server.close(done)); }
    assert.equal(dirname(resolve(directory)), base);
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
