import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb, seedClient } from "./client-fixture";
import { handleClerkPilotRequest } from "../../worker/client/clerk-pilot";

const ORIGIN = "http://localhost:8787";
function pilotEnv(overrides: Record<string, unknown> = {}): Env {
  return Object.assign({}, env, {
    CLERK_PILOT_ENABLED: "true",
    CLERK_PUBLISHABLE_KEY: "pk_test_fixture_not_real",
    CLERK_JWT_KEY: "fixture-public-key",
    CLERK_PILOT_ISSUER: "https://clerk-fixture.example",
    ...overrides,
  }) as Env;
}
function req(method = "GET", origin = ORIGIN) {
  return new Request(origin + "/api/clerk-pilot/me", { method });
}
const identity = async () => "user_fixture_alice";
const anonymous = async () => null;

describe("Clerk migration pilot: isolated and fail closed", () => {
  beforeAll(bootstrapPrivateDb);

  it("does not intercept other app routes", async () => {
    expect(await handleClerkPilotRequest(new Request(ORIGIN + "/api/client/me"), pilotEnv(), identity)).toBeNull();
  });

  it("is completely dark by default and never calls Clerk", async () => {
    let calls = 0;
    const response = await handleClerkPilotRequest(req(), pilotEnv({ CLERK_PILOT_ENABLED: "false" }), async () => {
      calls++;
      return "user_fixture_alice";
    });
    expect(response?.status).toBe(404);
    expect(calls).toBe(0);
    expect(response?.headers.get("Cache-Control")).toContain("no-store");
  });

  it("does not accept mutations, cross-origin hosts or missing public verification config", async () => {
    expect((await handleClerkPilotRequest(req("POST"), pilotEnv(), identity))?.status).toBe(405);
    expect((await handleClerkPilotRequest(req("GET", "https://rogue.invalid"), pilotEnv(), identity))?.status).toBe(403);
    expect((await handleClerkPilotRequest(req(), pilotEnv({ CLERK_JWT_KEY: undefined }), identity))?.status).toBe(503);
    expect((await handleClerkPilotRequest(req(), pilotEnv({ CLERK_PILOT_ISSUER: undefined }), identity))?.status).toBe(503);
  });

  it("rejects anonymous and unlinked identities, including legacy email matches", async () => {
    await seedClient();
    expect((await handleClerkPilotRequest(req(), pilotEnv(), anonymous))?.status).toBe(401);
    expect((await handleClerkPilotRequest(req(), pilotEnv(), identity))?.status).toBe(403);
  });

  it("allows only explicitly mapped, enabled, version-matching client UUIDs", async () => {
    const clientId = await seedClient();
    const userId = "user_fixture_linked_" + clientId;
    const linked = async () => userId;
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO clerk_pilot_identity_links (clerk_user_id,client_id,session_version_at_link,created_at) VALUES (?,?,1,?)",
    ).bind(userId, clientId, now).run();

    const allowed = await handleClerkPilotRequest(req(), pilotEnv(), linked);
    expect(allowed?.status).toBe(200);
    expect(allowed?.headers.get("Cache-Control")).toContain("no-store");
    expect(await allowed?.json()).toEqual({ authenticated: true, linked: true, clientId });
    const oldSession = (await handleClerkPilotRequest(req(), pilotEnv(), linked))?.status;
    expect(oldSession).toBe(200);

    await env.DB.prepare("UPDATE client_accounts SET session_version = session_version + 1 WHERE id=?").bind(clientId).run();
    expect((await handleClerkPilotRequest(req(), pilotEnv(), linked))?.status).toBe(403);
    await env.DB.prepare("UPDATE clerk_pilot_identity_links SET session_version_at_link = session_version_at_link + 1 WHERE clerk_user_id=?").bind(userId).run();
    await env.DB.prepare("UPDATE client_accounts SET disabled_at = datetime('now') WHERE id=?").bind(clientId).run();
    expect((await handleClerkPilotRequest(req(), pilotEnv(), linked))?.status).toBe(403);
  });

  it("keeps the real Worker pilot endpoint dark and old client routes unauthenticated", async () => {
    const pilot = await exports.default.fetch(req());
    expect(pilot.status).toBe(404);
    expect(pilot.headers.get("Cache-Control")).toContain("no-store");

    const existing = await exports.default.fetch(new Request(ORIGIN + "/api/client/me", {
      headers: { Authorization: "Bearer user_fixture_alice" },
    }));
    expect(existing.status).toBe(401);
  });
  it("never treats a client Clerk identity as admin or accepts it for legacy album endpoints", async () => {
    const unrelated = await handleClerkPilotRequest(new Request(ORIGIN + "/admin/api/clientes"), pilotEnv(), identity);
    expect(unrelated).toBeNull();
    expect((await handleClerkPilotRequest(new Request(ORIGIN + "/api/client/galleries"), pilotEnv(), identity))).toBeNull();
  });
});
