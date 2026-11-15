import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { assertSelectedIdentity, loadAuthHandlers, proofInputs, proveHandlers, withProofDatabase } from "./hostinger-clerk-production-proof.mjs";

const fixture = {
  CLERK_SECRET_KEY: "sk_live_fixtureOnly",
  CLERK_PUBLISHABLE_KEY: "pk_live_" + Buffer.from("clerk.punctumpicture.com$").toString("base64"),
  SOURCE_ADMIN_EMAIL: "proof@example.invalid",
  PUNCTUM_CLERK_ADMIN_USER_ID: "user_proof_fixture",
  PUNCTUM_CLERK_SESSION_ID: "sess_proof_fixture",
};
const input = proofInputs(fixture);
const user = {
  id: input.userId, primary_email_address_id: "id_primary", password_enabled: true, banned: false, locked: false,
  email_addresses: [{ id: "id_primary", email_address: input.email, verification: { status: "verified" } }],
};
const session = {
  id: input.sessionId, user_id: input.userId, client_id: "client_fixture", status: "active", actor: null,
  expire_at: Date.now() + 3600_000, abandon_at: Date.now() + 3600_000, latest_activity: { browser_name: "Fixture browser" },
};

test("real-Clerk proof fails closed on input, selected identity and active browser session boundaries", () => {
  for (const name of Object.keys(fixture)) assert.throws(() => proofInputs({ ...fixture, [name]: "" }));
  for (const override of [
    { CLERK_SECRET_KEY: "sk_test_fixture" },
    { CLERK_PUBLISHABLE_KEY: fixture.CLERK_PUBLISHABLE_KEY.replace("pk_live_", "pk_test_") },
    { CLERK_PUBLISHABLE_KEY: "pk_live_" + Buffer.from("other.example$").toString("base64") },
    { SOURCE_ADMIN_EMAIL: "a@example.invalid,b@example.invalid" },
    { PUNCTUM_CLERK_ADMIN_USER_ID: "user_one/other" },
    { PUNCTUM_CLERK_SESSION_ID: "sess_one/other" },
  ]) assert.throws(() => proofInputs({ ...fixture, ...override }));
  assert.doesNotThrow(() => assertSelectedIdentity(input, user, session));
  for (const override of [
    { id: "user_other" }, { password_enabled: false }, { banned: true }, { locked: true },
    { primary_email_address_id: "missing" },
    { email_addresses: [{ ...user.email_addresses[0], verification: { status: "unverified" } }] },
    { email_addresses: [{ ...user.email_addresses[0], email_address: "other@example.invalid" }] },
  ]) assert.throws(() => assertSelectedIdentity(input, { ...user, ...override }, session));
  for (const override of [
    { id: "sess_other" }, { user_id: "user_other" }, { status: "revoked" }, { status: "pending" },
    { expire_at: 0 }, { abandon_at: 0 }, { client_id: "" }, { latest_activity: null },
    { latest_activity: { browser_name: "" } }, { actor: { sub: "user_other" } },
  ]) assert.throws(() => assertSelectedIdentity(input, user, { ...session, ...override }));

  const env = { ...process.env, ...fixture, PUNCTUM_CLERK_SESSION_ID: "" };
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./hostinger-clerk-production-proof.mjs", import.meta.url))], { env, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "blocked", stage: "inputs", checks: {}, limit: "handler-only; no browser, deployed HTTP or live database coverage",
  });
  for (const value of Object.values(fixture)) assert(!result.stdout.includes(value) && !result.stderr.includes(value));
});

test("bundles the actual handlers and refuses anonymous admin requests without a verifier override", async () => {
  const auth = await loadAuthHandlers();
  await assert.rejects(() => auth.requireAdmin(new Request("https://punctumpicture.com/admin/api/clientes"), {
    ENVIRONMENT: "production", ADMIN_AUTH_MODE: "clerk",
  }), (error) => error.status === 403 && error.code === "ADMIN_UNAUTHORIZED");
});

test("private temp database cleans up on failure and restores candidate mode", async () => {
  const before = readdirSync(tmpdir()).filter((name) => name.startsWith("punctum-real-clerk-proof-"));
  const mode = process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE;
  const sentinel = new Error("fixture failure");
  await assert.rejects(() => withProofDatabase(async () => { throw sentinel; }), process.platform === "win32" ? undefined : (error) => error === sentinel);
  assert.deepEqual(readdirSync(tmpdir()).filter((name) => name.startsWith("punctum-real-clerk-proof-")), before);
  assert.equal(process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE, mode);
});

test("offline RS256 fixture exercises the proof handlers, not live Clerk evidence", { skip: process.platform === "win32" ? "candidate adapter requires private POSIX modes" : false }, async () => {
  const { exportSPKI, generateKeyPair, SignJWT } = await import("jose");
  const auth = await loadAuthHandlers();
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwt = await new SignJWT({ sid: input.sessionId, azp: "https://punctumpicture.com" })
    .setProtectedHeader({ alg: "RS256", kid: "offline-fixture" })
    .setSubject(input.userId).setIssuer("https://clerk.punctumpicture.com")
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const checks = {};
  const pem = await exportSPKI(publicKey);
  await withProofDatabase((db) => proveHandlers(auth, db, input, jwt, pem, checks));
  assert.deepEqual(checks, {
    realJwtVerifiedByWorker: true, unlinkedDenied: true, linkedAdminSucceeded: true, secureCookie: true,
    roleAndClientDenied: true, tamperedSignatureDenied: true, logoutAndReplayDenied: true, legacyFallbackSucceeded: true,
  });
});
