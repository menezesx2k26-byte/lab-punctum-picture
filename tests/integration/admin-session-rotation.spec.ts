import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { handleClientAdminApi } from "../../worker/api/client-admin";
import { bootstrapPrivateDb, privateRequest } from "./client-fixture";
import { auditPrincipal, createAdminSession, requireAdmin } from "../../worker/utils/auth";

describe("admin session revocation on credential rotation", () => {
  beforeAll(bootstrapPrivateDb);
  it("rejects a previously signed admin cookie after the credential revision changes", async () => {
    const credential = { passwordHash: "synthetic-password-hash-v1" };
    const db = {
      prepare: () => ({
        first: async () => ({
          passwordHash: credential.passwordHash,
          passwordSalt: "test-only-salt",
          passwordIterations: 60_000,
        }),
      }),
    } as unknown as D1Database;
    const testEnv = {
      DB: db,
      ENVIRONMENT: "production",
      ADMIN_SESSION_SECRET: "test-only-admin-session-hmac-secret",
      ADMIN_ALLOWED_EMAILS: "admin@example.invalid",
      ADMIN_PASSWORD_HASH: "test-only-legacy-hash",
    } as unknown as Env;
    const token = await createAdminSession("admin@example.invalid", testEnv);
    const request = new Request("https://site.example/admin/api/me", {
      headers: { Cookie: "punctum_admin_session=" + token },
    });

    await expect(requireAdmin(request, testEnv)).resolves.toMatchObject({
      email: "admin@example.invalid",
      roles: ["admin"],
    });
    credential.passwordHash = "synthetic-password-hash-v2";
    await expect(requireAdmin(request, testEnv)).rejects.toMatchObject({
      status: 403,
      code: "ADMIN_UNAUTHORIZED",
    });
  });
  it("does not attribute a shared-password session to a self-declared administrator email", async () => {
    const testEnv = {
      ENVIRONMENT: "production",
      ADMIN_SESSION_SECRET: "isolated-hmac-secret-synthetic-fixture",
      ADMIN_PASSWORD_HASH: "synthetic-hash-of-shared-password",
      ADMIN_ALLOWED_EMAILS: "first@example.test,second@example.test",
    } as unknown as Env;
    const firstToken = await createAdminSession("first@example.test", testEnv);
    const secondToken = await createAdminSession("second@example.test", testEnv);
    const auth = async (cookie: string) => requireAdmin(
      new Request("https://example.test/admin/api/me", {
        headers: { Cookie: "punctum_admin_session=" + cookie },
      }),
      testEnv,
    );
    const first = await auth(firstToken);
    const second = await auth(secondToken);
    expect(first.email).toBe("first@example.test");
    expect(second.email).toBe("second@example.test");
    // The login email is asserted by the caller, not verified as a distinct person.
    // An audit record must name the shared secret, not impersonate the named person.
    expect(auditPrincipal(first)).toBe("shared-password@punctum.invalid");
    expect(auditPrincipal(second)).toBe("shared-password@punctum.invalid");
    expect(auditPrincipal(first)).not.toBe(first.email);
    expect(auditPrincipal(second)).not.toBe(second.email);
  });

  it("records the shared credential principal rather than a caller-selected admin email in D1 audit_log", async () => {
    const testEnv = {
      ...env,
      ENVIRONMENT: "production",
      CLIENT_AUTH_MODE: "access",
      ADMIN_ALLOWED_EMAILS: "first@example.test,second@example.test",
      SITE_ORIGIN: "http://localhost:8787",
    } as unknown as Env;
    const token = await createAdminSession("second@example.test", testEnv);
    const email = crypto.randomUUID() + "@example.test";
    const url = new URL("http://localhost:8787/admin/api/clientes");
    const res = await handleClientAdminApi(
      privateRequest(url.pathname, "POST", { name: "Synthetic Audit Client", email },
        "punctum_admin_session=" + token),
      url,
      testEnv,
    );
    expect(res?.status).toBe(201);
    const body = await res!.json() as { client: { id: string } };
    const audit = await env.DB.prepare(
      "SELECT actor_email AS actorEmail FROM audit_log WHERE entity_id=? AND action='client.created' ORDER BY created_at DESC LIMIT 1",
    ).bind(body.client.id).first<{ actorEmail: string }>();
    expect(audit?.actorEmail).toBe("shared-password@punctum.invalid");
  });

});
