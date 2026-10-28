import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { requireAdmin } from "../../worker/utils/auth";

describe("administrative Access JWT mandatory claims", () => {
  let sign: (claims: Record<string, unknown>) => Promise<string>;
  let keys: JWTVerifyGetKey;
  const testEnv = { ...env, ENVIRONMENT: "production", CLOUDFLARE_TEAM_DOMAIN: "claims.cloudflareaccess.com", CLOUDFLARE_ACCESS_AUD: "admin-claims-audience", CLIENT_ACCESS_AUD: "client-distinct-audience", ADMIN_ALLOWED_EMAILS: "qa@punctum.invalid" } as Env;
  const identity = () => ({ email: "qa@punctum.invalid", sub: "synthetic-admin", type: "app", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 });
  const verify = async (claims: Record<string, unknown>) => requireAdmin(new Request("https://punctumpicture.com/admin/api/clientes", { headers: { "Cf-Access-Jwt-Assertion": await sign(claims) } }), testEnv, keys);
  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: "admin-claims", alg: "RS256" }] });
    sign = (claims) => new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "admin-claims" }).setIssuer("https://claims.cloudflareaccess.com").setAudience("admin-claims-audience").sign(privateKey);
  });
  it("accepts a complete signed application identity from the administrative allowlist", async () => {
    await expect(verify(identity())).resolves.toEqual({ email: "qa@punctum.invalid", roles: ["admin"] });
  });
  it("rejects absent identity/lifetime claims even with a valid signature and allowlisted email", async () => {
    for (const field of ["exp", "iat", "sub", "type"]) {
      const incomplete: Record<string, unknown> = { ...identity() }; delete incomplete[field];
      await expect(verify(incomplete), "missing " + field).rejects.toMatchObject({ status: 403, code: "ADMIN_UNAUTHORIZED" });
    }
  });
  it("rejects future issuance, inconsistent lifetime, empty subject and non-application identity", async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const invalid of [{ iat: now + 120 }, { iat: now + 20, exp: now + 10 }, { sub: "" }, { type: "service" }]) {
      await expect(verify({ ...identity(), ...invalid })).rejects.toMatchObject({ status: 403, code: "ADMIN_UNAUTHORIZED" });
    }
  });
});
