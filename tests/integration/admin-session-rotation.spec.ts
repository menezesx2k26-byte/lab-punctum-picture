import { describe, expect, it } from "vitest";
import { auditPrincipal, createAdminSession, requireAdmin } from "../../worker/utils/auth";

describe("admin session revocation on credential rotation", () => {
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

});
