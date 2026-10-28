import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID, pbkdf2Sync } from "node:crypto";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createPasswordBridgeServer, BRIDGE_PATH } from "./server.mjs";

const secret = "testing-only-long-secret-for-password-bridge!";
let server;
let base;
let replayDirectory;
before(async () => {
  replayDirectory = await mkdtemp(join(tmpdir(), "punctum-bridge-test-"));
  server = createPasswordBridgeServer({ secret, replayDirectory });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(replayDirectory, { recursive: true, force: true });
});
async function send(operation, password, credential, overrides = {}) {
  const payload = overrides.payload ?? JSON.stringify({ operation, password, ...(credential ? { credential } : {}) });
  const timestamp = String(overrides.timestamp ?? Date.now());
  const nonce = overrides.nonce ?? randomUUID();
  const signature = createHmac("sha256", overrides.secret ?? secret)
    .update(timestamp + "\n" + nonce + "\n" + payload)
    .digest("base64url");
  const response = await fetch(base + BRIDGE_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Punctum-Timestamp": timestamp,
      "X-Punctum-Nonce": nonce,
      "X-Punctum-Signature": overrides.signature ?? signature,
    },
    body: overrides.sentPayload ?? payload,
  });
  return { status: response.status, json: await response.json() };
}
test("creates and verifies PBKDF2-SHA256/310000 credentials", async () => {
  const hashed = await send("hash", "temporary-strong-password");
  assert.equal(hashed.status, 200);
  assert.equal(hashed.json.credential.passwordIterations, 310000);
  assert.match(hashed.json.credential.passwordSalt, /^[A-Za-z0-9_-]{22}$/);
  assert.match(hashed.json.credential.passwordHash, /^[A-Za-z0-9_-]{43}$/);
  const yes = await send("verify", "temporary-strong-password", hashed.json.credential);
  const no = await send("verify", "incorrect-password", hashed.json.credential);
  assert.deepEqual(yes, { status: 200, json: { valid: true } });
  assert.deepEqual(no, { status: 200, json: { valid: false } });
});
test("rejects absent or incorrect HMAC signature and stale request", async () => {
  const invalid = await send("hash", "password", undefined, { secret: "a-different-secret-with-no-authorization" });
  assert.equal(invalid.status, 401);
  const stale = await send("hash", "password", undefined, { timestamp: Date.now() - 120_000 });
  assert.equal(stale.status, 401);
  const unauthenticated = await fetch(base + BRIDGE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "hash", password: "password" }),
  });
  assert.equal(unauthenticated.status, 401);
});
test("rejects a tampered signed body and future timestamps", async () => {
  const original = JSON.stringify({ operation: "hash", password: "synthetic-password" });
  assert.equal((await send("hash", "synthetic-password", undefined, {
    payload: original, sentPayload: original.replace("synthetic-password", "tampered-password"),
  })).status, 401);
  assert.equal((await send("hash", "synthetic-password", undefined, { timestamp: Date.now() + 120_000 })).status, 401);
});
test("rejects unknown signed fields and credentials on hash requests", async () => {
  for (const input of [
    { operation: "hash", password: "synthetic-password", clientId: "other-client" },
    { operation: "hash", password: "synthetic-password", credential: {} },
    { operation: "verify", password: "synthetic-password", credential: {
      passwordHash: "A".repeat(43), passwordSalt: "A".repeat(22), passwordIterations: 310000, token: "must-not-accept",
    } },
  ]) assert.equal((await send("hash", "synthetic-password", undefined, { payload: JSON.stringify(input) })).status, 400);
});
test("rejects replay and malformed credential; never returns a session", async () => {
  const nonce = randomUUID();
  const first = await send("hash", "password", undefined, { nonce });
  const second = await send("hash", "password", undefined, { nonce });
  assert.equal(first.status, 200);
  assert.equal(second.status, 401);
  const malformed = await send("verify", "password", {
    passwordHash: "bad", passwordSalt: "bad", passwordIterations: 1,
  });
  assert.equal(malformed.status, 400);
  assert.equal(first.json.token, undefined);
});
test("rejects oversized payloads and invalid routes without leaking implementation", async () => {
  const bad = await fetch(base + BRIDGE_PATH, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: "x".repeat(5000),
  });
  assert.equal(bad.status, 413);
  const notFound = await fetch(base + "/internal/other", { method: "POST" });
  assert.equal(notFound.status, 404);
  const health = await fetch(base + "/healthz");
  assert.equal(health.status, 200);
});

test("requires an explicit replay directory outside the deployed application", () => {
  assert.throws(() => createPasswordBridgeServer({ secret }), /replay/i);
  assert.throws(() => createPasswordBridgeServer({ secret, replayDirectory: process.cwd() }), /replay/i);
});

test("rejects replay across independent server instances and a restarted process", async () => {
  const nonce = randomUUID();
  const timestamp = Date.now();
  assert.equal((await send("hash", "password", undefined, { nonce, timestamp })).status, 200);
  for (let i = 0; i < 2; i++) {
    const peer = createPasswordBridgeServer({ secret, replayDirectory });
    await new Promise((resolve) => peer.listen(0, "127.0.0.1", resolve));
    const originalBase = base;
    try {
      base = "http://127.0.0.1:" + peer.address().port;
      assert.equal((await send("hash", "password", undefined, { nonce, timestamp })).status, 401);
    } finally {
      base = originalBase;
      await new Promise((resolve) => peer.close(resolve));
    }
  }
  const child = spawnSync(process.execPath, ["--input-type=module", "-e",
    "const {createReplayStore}=await import(process.argv[1]);console.log(await createReplayStore(process.argv[2])(process.argv[3]));",
    new URL("./replay-store.mjs", import.meta.url).href, replayDirectory, nonce,
  ], { encoding: "utf8", timeout: 10000 });
  assert.equal(child.status, 0);
  assert.equal(child.stdout.trim(), "false");
});

test("reserves capacity before asynchronous body reads", async () => {
  const pending = [];
  const payload = JSON.stringify({ operation: "hash", password: "slow-body-password" });
  try {
    for (let i = 0; i < 4; i++) {
      const timestamp = String(Date.now());
      const nonce = randomUUID();
      const signature = createHmac("sha256", secret).update(timestamp + "\n" + nonce + "\n" + payload).digest("base64url");
      const request = http.request(base + BRIDGE_PATH, {
        method: "POST", headers: {
          "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload),
          "X-Punctum-Timestamp": timestamp, "X-Punctum-Nonce": nonce, "X-Punctum-Signature": signature,
        },
      });
      const done = new Promise((resolve, reject) => {
        request.on("response", (response) => { response.resume(); response.on("end", resolve); });
        request.on("error", reject);
      });
      request.write(payload.slice(0, 1));
      pending.push({ request, done });
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await send("hash", "password")).status, 429);
  } finally {
    for (const { request } of pending) request.end(payload.slice(1));
    await Promise.all(pending.map(({ done }) => done));
  }
});

test("verifies pre-existing credentials against independent native PBKDF2", async () => {
  const salt = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");
  const credential = {
    passwordHash: pbkdf2Sync("senha-acentuada-ç-🔒", salt, 310000, 32, "sha256").toString("base64url"),
    passwordSalt: salt.toString("base64url"), passwordIterations: 310000,
  };
  assert.equal((await send("verify", "senha-acentuada-ç-🔒", credential)).json.valid, true);
});

test("rejects non-string hash and salt instead of coercing credentials", async () => {
  assert.equal((await send("verify", "password", {
    passwordHash: ["A".repeat(43)], passwordSalt: ["A".repeat(22)], passwordIterations: 310000,
  })).status, 400);
});

test("bounds authenticated request rate without exposing account information", async () => {
  const limited = createPasswordBridgeServer({ secret, replayDirectory, maxRequestsPerMinute: 2 });
  await new Promise((resolve) => limited.listen(0, "127.0.0.1", resolve));
  const originalBase = base;
  try {
    base = "http://127.0.0.1:" + limited.address().port;
    assert.equal((await send("hash", "")).status, 400);
    assert.equal((await send("hash", "")).status, 400);
    assert.equal((await send("hash", "")).status, 429);
  } finally {
    base = originalBase;
    await new Promise((resolve) => limited.close(resolve));
  }
});
