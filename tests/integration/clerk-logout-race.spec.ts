import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createClerkAdminSession,
  requireAdmin,
} from "../../worker/utils/auth";
import { createClientSession, requireClient } from "../../worker/client/auth";
import {
  resolveLinkedClerkAdmin,
  resolveLinkedClerkClient,
  verifyClerkSessionFromRequest,
  type ClerkRequestVerifier,
} from "../../worker/auth/clerk-auth";
import { handleAdminAuth } from "../../worker/api/admin-auth";
import { handleClientSessionApi } from "../../worker/api/client-session";
import worker from "../../worker/test-entry";
import { bootstrapPrivateDb, seedClient } from "./client-fixture";

const origin = "https://auth.example.invalid";

async function fixture() {
  const suffix = crypto.randomUUID().replaceAll("-", ""), user = `user_${suffix}`, sid = `sess_${suffix}`;
  const email = `${suffix}@example.invalid`, client = await seedClient();
  await env.DB.prepare(`INSERT INTO clerk_admin_identity_links
    (clerk_user_id,admin_principal_id,role,session_version,created_at,updated_at)
    VALUES (?,?,'admin',1,datetime('now'),datetime('now'))`).bind(user, email).run();
  await env.DB.prepare(`INSERT INTO clerk_pilot_identity_links
    (clerk_user_id,client_id,session_version_at_link,created_at) VALUES (?,?,1,datetime('now'))`)
    .bind(user, client).run();
  const activeEnv = { ...env, ENVIRONMENT: "production", SITE_ORIGIN: origin,
    CLERK_AUTH_ENABLED: "true", ADMIN_AUTH_MODE: "clerk", CLIENT_AUTH_MODE: "clerk",
    ADMIN_ALLOWED_EMAILS: email, CLERK_ISSUER: "https://clerk.example.invalid",
    CLERK_PUBLISHABLE_KEY: "pk_test_synthetic", CLERK_JWT_KEY: "synthetic-verifier-only" } as unknown as Env;
  const verifier: ClerkRequestVerifier = async () => ({ clerkUserId: user, sessionId: sid });
  const raw = (nonce = "first") => new Request(origin + "/api/client/me", {
    headers: { Authorization: `Bearer synthetic.${btoa(JSON.stringify({ sid, nonce }))}.signature` },
  });
  return { activeEnv, verifier, raw, user, client };
}

function pauseRevocationRead(db: D1Database) {
  let reached: () => void = () => {}, release: () => void = () => {};
  const checked = new Promise<void>(resolve => { reached = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const paused = new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") return (sql: string) => {
        const statement = target.prepare(sql);
        if (!sql.includes("SELECT 1 AS revoked")) return statement;
        return { bind: (...values: unknown[]) => {
          const bound = statement.bind(...values);
          return { first: async () => {
            const row = await bound.first();
            reached();
            await barrier;
            return row;
          } };
        } };
      };
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as D1Database;
  return { db: paused, checked, release };
}

describe("Clerk sid logout across overlapping logins", () => {
  beforeAll(bootstrapPrivateDb);
  it.each(["admin", "client"] as const)("denies a new-version %s cookie minted after its sid logged out", async (kind) => {
    const f = await fixture();
    const initialAdmin = await resolveLinkedClerkAdmin(f.raw(), f.activeEnv, { verifier: f.verifier });
    const initialClient = await resolveLinkedClerkClient(f.raw(), f.activeEnv, env.DB, { verifier: f.verifier });
    const cookie = kind === "admin"
      ? `punctum_admin_session=${await createClerkAdminSession(initialAdmin!, f.activeEnv)}`
      : `punctum_client_session=${await createClientSession(initialClient, f.activeEnv, "punctum-client-clerk", initialClient.revocationKeys)}`;
    const gate = pauseRevocationRead(env.DB), racingEnv = { ...f.activeEnv, DB: gate.db } as Env;
    const login = kind === "admin"
      ? resolveLinkedClerkAdmin(f.raw(), racingEnv, { verifier: f.verifier })
      : resolveLinkedClerkClient(f.raw(), racingEnv, gate.db, { verifier: f.verifier });
    await gate.checked;
    try {
      const url = new URL(origin + (kind === "admin" ? "/admin/api/session" : "/api/client/session"));
      const request = new Request(url, { method: "DELETE", headers: { Cookie: cookie, Origin: origin } });
      const response = kind === "admin" ? await handleAdminAuth(request, url, f.activeEnv)
        : await handleClientSessionApi(request, url, f.activeEnv);
      expect(response?.status).toBe(200);
    } finally { gate.release(); }
    const raced = await login;
    expect(raced?.sessionVersion).toBe(2);
    const racedCookie = kind === "admin"
      ? `punctum_admin_session=${await createClerkAdminSession(raced as NonNullable<typeof initialAdmin>, f.activeEnv)}`
      : `punctum_client_session=${await createClientSession(raced as typeof initialClient, f.activeEnv, "punctum-client-clerk", raced!.revocationKeys)}`;
    for (const signedCookie of [cookie, racedCookie]) {
      const request = new Request(origin + "/admin/api/me", { headers: { Cookie: signedCookie } });
      if (kind === "admin") await expect(requireAdmin(request, f.activeEnv)).rejects.toMatchObject({ status: 403 });
      else await expect(requireClient(request, f.activeEnv, env.DB)).rejects.toMatchObject({ status: 401 });
    }
    expect(await verifyClerkSessionFromRequest(f.raw("fresh-token-same-sid"), f.activeEnv, { verifier: f.verifier })).toBeNull();
  });

  it.each(["admin", "client", "raw"] as const)("returns storage-unavailable for %s revocation read errors", async (kind) => {
    const f = await fixture();
    const admin = await resolveLinkedClerkAdmin(f.raw(), f.activeEnv, { verifier: f.verifier });
    const client = await resolveLinkedClerkClient(f.raw(), f.activeEnv, env.DB, { verifier: f.verifier });
    const cookie = kind === "admin"
      ? `punctum_admin_session=${await createClerkAdminSession(admin!, f.activeEnv)}`
      : `punctum_client_session=${await createClientSession(client, f.activeEnv, "punctum-client-clerk", client.revocationKeys)}`;
    const brokenDb = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "prepare") return (sql: string) => {
          if (sql.includes("revoked_clerk_tokens")) throw Error("synthetic D1 unavailable");
          return target.prepare(sql);
        };
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const brokenEnv = { ...f.activeEnv, DB: brokenDb } as Env;
    if (kind === "raw") {
      await expect(verifyClerkSessionFromRequest(f.raw(), brokenEnv, { verifier: f.verifier }))
        .rejects.toMatchObject({ status: 503, code: "CLERK_REVOCATION_UNAVAILABLE" });
    } else {
      const response = await worker.fetch(new Request(origin + (kind === "admin" ? "/admin/api/me" : "/api/client/me"), {
        headers: { Cookie: cookie },
      }), brokenEnv);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: "CLERK_REVOCATION_UNAVAILABLE" } });
    }
  });
});
