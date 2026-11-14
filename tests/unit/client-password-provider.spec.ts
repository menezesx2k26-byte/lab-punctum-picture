import { describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";
import { hashClientPasswordWithProvider, verifyClientPasswordWithProvider } from "../../worker/client/password-provider";
const secret = "testing-only-long-secret-for-password-bridge!";
const credential = { passwordHash: "A".repeat(43), passwordSalt: "A".repeat(22), passwordIterations: 310_000 };
const setup = (vars: Record<string,string> = {}) => ({
  ...env, CLIENT_PASSWORD_BACKEND: "hostinger",
  CLIENT_PASSWORD_SERVICE_URL: "https://isolated.example.test/internal/punctum-password/v1",
  CLIENT_PASSWORD_SERVICE_SECRET: secret, ...vars,
}) as Env;
describe("Hostinger crypto provider", () => {
  it("HMAC signs each HTTPS request and accepts typed responses", async () => {
    let count = 0;
    const fetcher: typeof fetch = async (url, init) => {
      count++;
      expect(String(url)).toBe("https://isolated.example.test/internal/punctum-password/v1");
      const headers = new Headers(init?.headers);
      const body = String(init?.body);
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const sig = headers.get("X-Punctum-Signature")!.replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
      const payload = new TextEncoder().encode(headers.get("X-Punctum-Timestamp") + "\n" + headers.get("X-Punctum-Nonce") + "\n" + body);
      expect(await crypto.subtle.verify("HMAC", key, bytes, payload)).toBe(true);
      const operation = (JSON.parse(body) as { operation: string }).operation;
      return new Response(JSON.stringify(operation === "hash" ? { credential } : { valid: true }));
    };
    expect(await hashClientPasswordWithProvider("secure-password", setup(), fetcher)).toEqual(credential);
    expect(await verifyClientPasswordWithProvider("secure-password", credential, setup(), fetcher)).toBe(true);
    expect(count).toBe(2);
  });
  it("fails closed without HTTPS, correct path or 32-byte key", async () => {
    for (const url of ["http://isolated.example.test/internal/punctum-password/v1", "https://isolated.example.test/other", "https://localhost/internal/punctum-password/v1?secret=test"]) {
      await expect(hashClientPasswordWithProvider("password", setup({ CLIENT_PASSWORD_SERVICE_URL: url }))).rejects.toMatchObject({ status: 503 });
    }
    await expect(hashClientPasswordWithProvider("password", setup({ CLIENT_PASSWORD_SERVICE_SECRET: "short" }))).rejects.toMatchObject({ status: 503 });
  });
  it("fails closed when the backend is offline or returns corrupt credentials", async () => {
    const offline: typeof fetch = async () => { throw new Error("offline"); };
    await expect(hashClientPasswordWithProvider("password", setup(), offline)).rejects.toMatchObject({ status: 503 });
    const bad: typeof fetch = async () => new Response(JSON.stringify({ credential: { passwordHash: "bad" } }));
    await expect(hashClientPasswordWithProvider("password", setup(), bad)).rejects.toMatchObject({ status: 503 });
  });
  it("preserves legacy local PBKDF2 without opt-in", async () => {
    const c = await hashClientPasswordWithProvider("password", env);
    expect(c.passwordIterations).toBe(310000);
    expect(await verifyClientPasswordWithProvider("password", c, env)).toBe(true);
  });

  it("rejects reusing application session secrets for the bridge", async () => {
    for (const name of ["CLIENT_SESSION_SECRET", "ADMIN_SESSION_SECRET"]) {
      const unsafe = setup({ [name]: secret });
      const ok: typeof fetch = async () => new Response(JSON.stringify({ valid: true }));
      await expect(verifyClientPasswordWithProvider("password", credential, unsafe, ok)).rejects.toMatchObject({ status: 503 });
    }
  });

  it("cancels an oversized chunked backend response before draining it", async () => {
    let reads = 0;
    let cancelled = false;
    const oversized: typeof fetch = async () => new Response(new ReadableStream({
      pull(controller) {
        reads++;
        if (reads <= 10) controller.enqueue(new Uint8Array(1024).fill(32));
        else controller.close();
      },
      cancel() { cancelled = true; },
    }));
    await expect(verifyClientPasswordWithProvider("password", credential, setup(), oversized)).rejects.toMatchObject({ status: 503 });
    expect(cancelled).toBe(true);
    expect(reads).toBeLessThan(10);
  });

  it("denies Access-only or corrupt legacy credentials without distinguishing account existence", async () => {
    const backend: typeof fetch = async (_url, init) => {
      const input = JSON.parse(String(init?.body)) as { credential: { passwordHash: string } };
      return input.credential.passwordHash === "ACCESS_ONLY"
        ? new Response("{}", { status: 400 })
        : new Response(JSON.stringify({ valid: true }));
    };
    await expect(verifyClientPasswordWithProvider("password", {
      passwordHash: "ACCESS_ONLY", passwordSalt: "ACCESS_ONLY", passwordIterations: 310000,
    }, setup(), backend)).resolves.toBe(false);
  });
});
