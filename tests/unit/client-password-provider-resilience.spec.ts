import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { hashClientPasswordWithProvider, verifyClientPasswordWithProvider } from "../../worker/client/password-provider";

const credential = { passwordHash: "A".repeat(43), passwordSalt: "A".repeat(22), passwordIterations: 310_000 };
const setup = () => ({ ...env, CLIENT_PASSWORD_BACKEND: "hostinger",
  CLIENT_PASSWORD_SERVICE_URL: "https://isolated.example.test/internal/punctum-password/v1",
  CLIENT_PASSWORD_SERVICE_SECRET: "synthetic-independent-bridge-secret-123456789" }) as Env;
afterEach(() => vi.restoreAllMocks());

describe("bridge failure containment", () => {
  it("rejects unexpected response fields instead of accepting a credential or token envelope", async () => {
    for (const payload of [
      { credential, token: "synthetic-token-must-not-be-accepted" },
      { credential: { ...credential, clientId: "another-client" } },
    ]) {
      await expect(hashClientPasswordWithProvider("synthetic-password", setup(), async () => Response.json(payload)))
        .rejects.toMatchObject({ status: 503 });
    }
    await expect(verifyClientPasswordWithProvider("synthetic-password", credential, setup(), async () => Response.json({ valid: true, token: "unexpected" })))
      .rejects.toMatchObject({ status: 503 });
  });

  it("opens after three failures and admits only one recovery probe after 30 seconds", async () => {
    const config = setup();
    let clock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    let attempts = 0;
    let release: ((response: Response) => void) | undefined;
    const backend: typeof fetch = async () => {
      attempts++;
      if (attempts <= 3) return new Response(null, { status: 503 });
      return new Promise<Response>((resolve) => { release = resolve; });
    };
    for (let i = 0; i < 4; i++) {
      await expect(verifyClientPasswordWithProvider("synthetic-password", credential, config, backend))
        .rejects.toMatchObject({ status: 503 });
    }
    expect(attempts).toBe(3);
    clock += 30_001;
    const recovery = verifyClientPasswordWithProvider("synthetic-password", credential, config, backend);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await expect(verifyClientPasswordWithProvider("synthetic-password", credential, config, backend))
      .rejects.toMatchObject({ status: 503 });
    expect(attempts).toBe(4);
    release!(Response.json({ valid: true }));
    await expect(recovery).resolves.toBe(true);
  });

  it("times out a stalled response body and cancels it without returning a password result", async () => {
    let cancelled = false;
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; controller.enqueue(new TextEncoder().encode("{")); },
      cancel() { cancelled = true; },
    });
    const call = verifyClientPasswordWithProvider("synthetic-password", credential, setup(), async () => new Response(stream))
      .then(() => ({ status: 200 }), (error: unknown) => error);
    let guard: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([call, new Promise((resolve) => {
        guard = setTimeout(() => resolve({ status: "TEST_DEADLINE_EXCEEDED" }), 6500);
      })]);
      expect(result).toMatchObject({ status: 503 });
      expect(cancelled).toBe(true);
    } finally {
      clearTimeout(guard);
      if (!cancelled) streamController!.close();
      await call;
    }
  });
});
