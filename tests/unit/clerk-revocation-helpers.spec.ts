import { describe, expect, it } from "vitest";
import {
  CLERK_SESSION_REVOCATION_TTL_SECONDS,
  CLERK_TOKEN_REVOCATION_TTL_SECONDS,
  clerkRevocationTtlSeconds,
  clerkSessionIdFromRawToken,
  clerkTokenRevocationKey,
} from "../../worker/auth/clerk-auth";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("G06/G08 Clerk revocation helper crypto contract", () => {
  it("keeps sid TTL strictly longer than token-digest TTL", () => {
    expect(CLERK_SESSION_REVOCATION_TTL_SECONDS).toBe(60 * 60 * 24 * 14);
    expect(CLERK_TOKEN_REVOCATION_TTL_SECONDS).toBe(86_400);
    expect(clerkRevocationTtlSeconds("sid:sess_x")).toBe(
      CLERK_SESSION_REVOCATION_TTL_SECONDS,
    );
    expect(clerkRevocationTtlSeconds("tk:abc")).toBe(
      CLERK_TOKEN_REVOCATION_TTL_SECONDS,
    );
    expect(clerkRevocationTtlSeconds("sid:sess_x", 99)).toBe(99);
  });

  it("extracts sid from raw JWT payload and rejects malformed tokens", () => {
    expect(clerkSessionIdFromRawToken(fakeJwt({ sid: "sess_ok_123" }))).toBe(
      "sess_ok_123",
    );
    expect(clerkSessionIdFromRawToken(fakeJwt({}))).toBeNull();
    expect(clerkSessionIdFromRawToken(fakeJwt({ sid: "" }))).toBeNull();
    expect(clerkSessionIdFromRawToken(fakeJwt({ sid: "ab" }))).toBeNull();
    expect(clerkSessionIdFromRawToken("not-a-jwt")).toBeNull();
    expect(clerkSessionIdFromRawToken("a.b")).toBeNull();
  });

  it("hashes raw tokens to stable tk: digests without colliding distinct inputs", async () => {
    const a = await clerkTokenRevocationKey("token-a");
    const b = await clerkTokenRevocationKey("token-b");
    expect(a).toMatch(/^tk:[a-f0-9]{64}$/);
    expect(b).toMatch(/^tk:[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
    expect(await clerkTokenRevocationKey("token-a")).toBe(a);
  });
});
