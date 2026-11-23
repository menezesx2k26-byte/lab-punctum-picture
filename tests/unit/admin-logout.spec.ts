import { describe, expect, it, vi } from "vitest";
import {
  performAdminLogout,
  shouldClerkSignOutAfterAdminLogout,
} from "../../app/admin/components/admin-logout";

describe("admin logout Clerk signOut sequencing (R2)", () => {
  it("only requests Clerk signOut when authSource is clerk and a publishable key exists", () => {
    expect(
      shouldClerkSignOutAfterAdminLogout({
        clerkPublishableKey: "pk_test",
        authSource: "clerk",
      }),
    ).toBe(true);
    expect(
      shouldClerkSignOutAfterAdminLogout({
        clerkPublishableKey: "pk_test",
        authSource: "shared-password",
      }),
    ).toBe(false);
    expect(
      shouldClerkSignOutAfterAdminLogout({
        clerkPublishableKey: undefined,
        authSource: "clerk",
      }),
    ).toBe(false);
  });

  it("fail-closes without signOut when Punctum DELETE fails", async () => {
    const signOut = vi.fn(async () => undefined);
    const result = await performAdminLogout({
      clerkPublishableKey: "pk_test",
      signOut,
      fetchImpl: async () => new Response(null, { status: 503 }),
    });
    expect(result).toEqual({
      ok: false,
      error: "Não foi possível encerrar a sessão.",
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("calls signOut only after a successful clerk authSource DELETE", async () => {
    const signOut = vi.fn(async () => undefined);
    const result = await performAdminLogout({
      clerkPublishableKey: "pk_test",
      signOut,
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true, authSource: "clerk" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });
    expect(result).toEqual({ ok: true, authSource: "clerk" });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("skips signOut for legacy shared-password sessions", async () => {
    const signOut = vi.fn(async () => undefined);
    const result = await performAdminLogout({
      clerkPublishableKey: "pk_test",
      signOut,
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true, authSource: "shared-password" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });
    expect(result).toEqual({ ok: true, authSource: "shared-password" });
    expect(signOut).not.toHaveBeenCalled();
  });
});
