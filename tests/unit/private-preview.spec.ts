import { describe, it, expect } from "vitest";
import {
  privatePreviewConfig,
  waitForPreviewStatus,
  PRIVATE_PREVIEW_NAMES,
  assertPreviewLoginEntry,
} from "../../scripts/lib/private-preview.mjs";
describe("isolated gallery preview", () => {
  it("replaces all production bindings, routes, secrets and schedules", () => {
    const config = privatePreviewConfig(
      {
        account_id: "wrong",
        name: "production",
        routes: [{ pattern: "punctumpicture.com" }],
        triggers: { crons: ["0 * * * *"] },
        vars: {
          ENVIRONMENT: "production",
          SITE_ORIGIN: "https://punctumpicture.com",
          ADMIN_SESSION_SECRET: "old",
        },
        d1_databases: [{ database_id: "22697f13-7484-41e3-9441-f7b902c6577a" }],
        r2_buckets: [{ bucket_name: "punctum-picture-originals" }],
      },
      {
        databaseId: "22222222-2222-4222-8222-222222222222",
        origin: "https://preview.example.workers.dev",
      },
    );
    expect(config.limits).toBeUndefined();
    expect(config.name).toBe(PRIVATE_PREVIEW_NAMES.worker);
    expect(config.routes).toEqual([]);
    expect(config.triggers.crons).toEqual([]);
    expect(config.vars.PRIVATE_GALLERIES_ENABLED).toBe("true");
    expect(config.vars.ENVIRONMENT).toBe("preview");
    expect(config.vars.ADMIN_SESSION_SECRET).toBeUndefined();
    expect(config.vars.SITE_ORIGIN).toBe("https://preview.example.workers.dev");
    expect(config.d1_databases[0].database_name).toBe(
      PRIVATE_PREVIEW_NAMES.database,
    );
    expect(
      config.r2_buckets.every((b: { bucket_name: string }) =>
        b.bucket_name.includes("albums-qa"),
      ),
    ).toBe(true);
  });
  it("keeps Workers Free preview without a paid CPU limit for Access login", () => {
    const config = privatePreviewConfig(
      {
        vars: {
          CLIENT_AUTH_MODE: "access",
          CLIENT_ACCESS_TEAM_DOMAIN: "production.cloudflareaccess.com",
          CLIENT_ACCESS_AUD: "production-audience",
        },
        limits: { cpu_ms: 2000 },
      },
      {
        databaseId: "22222222-2222-4222-8222-222222222222",
        origin: "https://qa.example.workers.dev",
      },
    );
    expect(config.limits).toBeUndefined();
    expect(config.vars.CLIENT_AUTH_MODE).toBe("access");
    expect(config.vars.CLIENT_ACCESS_TEAM_DOMAIN).toContain("qa-placeholder.");
    expect(config.vars.CLIENT_ACCESS_AUD).toBe("qa-access-not-configured");
  });
  it("refuses production IDs, origins and invalid restoration bindings", () => {
    for (const databaseId of [
      "22697f13-7484-41e3-9441-f7b902c6577a",
      "4e959036-a3f0-4faf-bda2-fca9b4c5e984",
      "",
    ]) {
      expect(() =>
        privatePreviewConfig(
          {},
          { databaseId, origin: "https://qa.example.workers.dev" },
        ),
      ).toThrow();
    }
    expect(() =>
      privatePreviewConfig(
        {},
        {
          databaseId: "22222222-2222-4222-8222-222222222222",
          origin: "https://punctumpicture.com",
        },
      ),
    ).toThrow();
    const restored = privatePreviewConfig(
      {},
      {
        databaseId: "33333333-3333-4333-8333-333333333333",
        origin: "https://qa.example.workers.dev",
        restored: true,
      },
    );
    expect(restored.d1_databases[0].database_name).toBe(
      PRIVATE_PREVIEW_NAMES.restoreDatabase,
    );
    expect(restored.r2_buckets[0].bucket_name).toBe(
      PRIVATE_PREVIEW_NAMES.restoreOriginals,
    );
  });
});

describe("preview propagation gate", () => {
  it("accepts only the real configured Access login redirect without claiming OTP success", () => {
    const config = { authMode: "access", accessTeamDomain: "qa.cloudflareaccess.com", accessAudience: "qa-audience" };
    const response = (location: string) => new Response(null, { status: 302, headers: { Location: location } });
    expect(assertPreviewLoginEntry(response("https://qa.cloudflareaccess.com/cdn-cgi/access/login/qa.workers.dev?kid=qa-audience"), config)).toBe("access-redirect");
    for (const location of [
      "https://attacker.example/cdn-cgi/access/login/qa.workers.dev?kid=qa-audience",
      "https://qa.cloudflareaccess.com/cdn-cgi/access/login/qa.workers.dev?kid=wrong-audience",
      "http://qa.cloudflareaccess.com/cdn-cgi/access/login/qa.workers.dev?kid=qa-audience",
    ]) expect(() => assertPreviewLoginEntry(response(location), config)).toThrow();
    expect(() => assertPreviewLoginEntry(new Response(null, { status: 401 }), config)).toThrow();
    expect(assertPreviewLoginEntry(new Response(null, { status: 401 }), { authMode: "access" })).toBe("access-unconfigured");
    expect(assertPreviewLoginEntry(new Response("Login"), { authMode: "password" })).toBe("password");
  });
  it("waits for a newly rotated session before allowing the pilot to continue", async () => {
    const statuses = [403, 403, 200];
    let probes = 0,
      pauses = 0;
    await waitForPreviewStatus({
      probe: async () => {
        probes++;
        return statuses.shift()!;
      },
      pause: async () => {
        pauses++;
      },
    });
    expect(probes).toBe(3);
    expect(pauses).toBe(2);
  });
  it("fails closed for persistent auth failures and unrelated server errors", async () => {
    await expect(
      waitForPreviewStatus({
        probe: async () => 403,
        pause: async () => {},
        attempts: 2,
      }),
    ).rejects.toThrow("timed out");
    await expect(
      waitForPreviewStatus({ probe: async () => 500, pause: async () => {} }),
    ).rejects.toThrow("HTTP 500");
  });
});

// The recovery stage has no portfolio routes or production bindings.
describe("standalone QA recovery configuration", () => {
  it("uses only distinct QA databases/buckets and refuses production or shared databases", async () => {
    const { privateRecoveryConfig } = await import("../../scripts/lib/private-preview.mjs");
    const config = privateRecoveryConfig({ clientId: "44444444-4444-4444-8444-444444444444", sourceId: "22222222-2222-4222-8222-222222222222", restoreId: "33333333-3333-4333-8333-333333333333", origin: "https://punctum-picture-albums-qa.example.workers.dev" });
    expect(config.routes).toEqual([]);
    expect(config.main).toBe("../scripts/private-recovery-worker.ts");
    expect(config.d1_databases.map((b: {binding:string}) => b.binding)).toEqual(["SOURCE_DB", "RESTORE_DB"]);
    expect(config.r2_buckets.every((b: {bucket_name:string}) => b.bucket_name.includes("albums-qa"))).toBe(true);
    for (const restoreId of ["22222222-2222-4222-8222-222222222222", "22697f13-7484-41e3-9441-f7b902c6577a"])
      expect(() => privateRecoveryConfig({ clientId: "44444444-4444-4444-8444-444444444444", sourceId: "22222222-2222-4222-8222-222222222222", restoreId, origin: "https://punctum-picture-albums-qa.example.workers.dev" })).toThrow();
  });
  it("rejects public, unknown or custom-domain bucket access", async () => {
    const { assertPrivateBucketPrivacy } = await import("../../scripts/lib/private-preview.mjs");
    expect(() => assertPrivateBucketPrivacy({ enabled: false }, { domains: [] })).not.toThrow();
    for (const [managed, custom] of [[{ enabled: true }, { domains: [] }], [{}, { domains: [] }], [{ enabled: false }, {}], [{ enabled: false }, { domains: [{ enabled: true }] }]])
      expect(() => assertPrivateBucketPrivacy(managed, custom)).toThrow();
  });
});

it("adapts REST object-list envelopes and refuses unknown pagination", async () => {
  const { r2RestListing } = await import("../../scripts/lib/private-preview.mjs");
  expect(r2RestListing({ success: true, result: [], result_info: { is_truncated: false } })).toEqual({ objects: [], truncated: false });
  expect(() => r2RestListing({ success: true, result: [] })).toThrow();
  expect(() => r2RestListing({ success: true, result: { objects: [] }, result_info: { is_truncated: false } })).toThrow();
});

it("refuses incomplete D1 responses instead of interpreting them as empty QA", async () => {
  const { d1QueryRows } = await import("../../scripts/lib/private-preview.mjs");
  expect(d1QueryRows([{ success: true, results: [] }])).toEqual([]);
  for (const result of [[], [{}], [{ success: true }], [{ success: false, results: [] }], { results: [] }])
    expect(() => d1QueryRows(result)).toThrow();
});
