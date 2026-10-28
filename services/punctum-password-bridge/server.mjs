import http from "node:http";
import {
  createHmac,
  pbkdf2,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createReplayStore } from "./replay-store.mjs";

const PATH = "/internal/punctum-password/v1";
const ITERATIONS = 310_000;
const MAX_BODY = 4096;
const MAX_CONCURRENT = 4;

const json = (response, status, payload) => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
};
const validSecret = (value) => typeof value === "string" && Buffer.byteLength(value) >= 32;
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export function createPasswordBridgeServer({ secret, replayDirectory, now = Date.now, maxRequestsPerMinute = 120 } = {}) {
  if (!validSecret(secret)) throw new Error("PUNCTUM_PASSWORD_BRIDGE_SECRET requires 32+ bytes.");
  const claimNonce = createReplayStore(replayDirectory, now);
  if (!Number.isInteger(maxRequestsPerMinute) || maxRequestsPerMinute < 1 || maxRequestsPerMinute > 120)
    throw new Error("Invalid bridge request limit.");
  let working = 0;
  let windowStarted = now();
  let requests = 0;

  async function authorized(timestamp, nonce, signature, body) {
    if (
      typeof timestamp !== "string" ||
      !/^\d{13}$/.test(timestamp) ||
      Math.abs(now() - Number(timestamp)) > 30_000 ||
      typeof nonce !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(nonce) ||
      typeof signature !== "string" ||
      !/^[a-zA-Z0-9_-]{43}$/.test(signature)
    ) return false;
    const received = Buffer.from(signature, "base64url");
    const expected = createHmac("sha256", secret)
      .update(timestamp + "\n" + nonce + "\n" + body)
      .digest();
    if (received.length !== expected.length || !timingSafeEqual(received, expected))
      return false;
    return claimNonce(nonce);
  }
  function derive(password, salt) {
    return new Promise((resolve, reject) => {
      pbkdf2(password, salt, ITERATIONS, 32, "sha256", (error, hash) => {
        if (error) reject(error);
        else resolve(hash);
      });
    });
  }
  const server = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      return json(response, 200, { ok: true, component: "punctum-password-bridge" });
    }
    if (request.url !== PATH || request.method !== "POST")
      return json(response, 404, { error: "NOT_FOUND" });
    if (working >= MAX_CONCURRENT)
      return json(response, 429, { error: "BUSY" });
    if (Number(request.headers["content-length"]) > MAX_BODY)
      return json(response, 413, { error: "PAYLOAD_TOO_LARGE" });

    // Reserve BEFORE the first await. Slow/chunked requests count toward capacity.
    working++;
    request.setTimeout(5000, () => request.destroy());
    try {
    const pieces = [];
    let bodySize = 0;
    for await (const chunk of request) {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY)
        return json(response, 413, { error: "PAYLOAD_TOO_LARGE" });
      pieces.push(chunk);
    }
    const body = Buffer.concat(pieces).toString("utf8");
    if (!await authorized(
      request.headers["x-punctum-timestamp"],
      request.headers["x-punctum-nonce"],
      request.headers["x-punctum-signature"],
      body,
    )) return json(response, 401, { error: "UNAUTHORIZED" });

    if (now() - windowStarted >= 60_000) { windowStarted = now(); requests = 0; }
    if (++requests > maxRequestsPerMinute)
      return json(response, 429, { error: "RATE_LIMITED" });

    let input;
    try { input = JSON.parse(body); }
    catch { return json(response, 400, { error: "INVALID_REQUEST" }); }
    if (
      !exactKeys(input, input?.operation === "verify" ? ["operation", "password", "credential"] : ["operation", "password"]) ||
      !["hash", "verify"].includes(input.operation) ||
      typeof input.password !== "string" ||
      input.password.length < 1 || input.password.length > 1024
    ) return json(response, 400, { error: "INVALID_REQUEST" });
    if (input.operation === "verify" && (
      !exactKeys(input.credential, ["passwordHash", "passwordSalt", "passwordIterations"]) ||
      input.credential.passwordIterations !== ITERATIONS ||
      typeof input.credential.passwordHash !== "string" ||
      typeof input.credential.passwordSalt !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.credential.passwordHash || "") ||
      !/^[A-Za-z0-9_-]{22}$/.test(input.credential.passwordSalt || "")
    )) return json(response, 400, { error: "INVALID_REQUEST" });

      if (input.operation === "hash") {
        const salt = randomBytes(16);
        const hash = await derive(input.password, salt);
        return json(response, 200, {
          credential: {
            passwordHash: hash.toString("base64url"),
            passwordSalt: salt.toString("base64url"),
            passwordIterations: ITERATIONS,
          },
        });
      }
      const credential = input.credential;
      const hash = await derive(
        input.password,
        Buffer.from(credential.passwordSalt, "base64url"),
      );
      const expected = Buffer.from(credential.passwordHash, "base64url");
      const valid = hash.length === expected.length && timingSafeEqual(hash, expected);
      return json(response, 200, { valid });
    } catch {
      if (!response.destroyed && !response.headersSent)
        return json(response, 503, { error: "SERVICE_UNAVAILABLE" });
    } finally {
      working--;
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 32;
  return server;
}
export const BRIDGE_PATH = PATH;
