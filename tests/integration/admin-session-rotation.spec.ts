import { describe, expect, it } from "vitest";
import { createAdminSession, requireAdmin } from "../../worker/utils/auth";

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
});
