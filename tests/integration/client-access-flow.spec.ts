import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { handlePrivateGalleryRoutes } from "../../worker/client/router";
import { bootstrapPrivateDb, privateRequest, seedClient, seedGallery, seedReadyImage } from "./client-fixture";

const PNG = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg==",
), (value) => value.charCodeAt(0));

describe("integrated Access identity and private album flow on isolated D1/R2", () => {
  beforeAll(bootstrapPrivateDb);
  afterEach(() => vi.unstubAllGlobals());

  it("binds signed identities to individual clients, denies cross-client access and revokes logout cookies", async () => {
    const testEnv = {
      ...env,
      CLIENT_AUTH_MODE: "access",
      CLIENT_ACCESS_TEAM_DOMAIN: "local-entry-flow.cloudflareaccess.com",
      CLIENT_ACCESS_AUD: "local-entry-flow-client-audience",
      CLOUDFLARE_ACCESS_AUD: "local-entry-flow-admin-audience",
    } as Env;
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    const jwk = { ...await exportJWK(publicKey), kid: "flow-key", alg: "RS256", use: "sig" };
    // Only the Cloudflare JWKS network boundary is replaced. JWT validation,
    // Worker routes, D1 authorization and private R2 bytes are real local code.
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input) !== "https://local-entry-flow.cloudflareaccess.com/cdn-cgi/access/certs")
        throw new Error("Unexpected outbound request in isolated Access test");
      return Response.json({ keys: [jwk] });
    });
    const sign = (email: string, audience = "local-entry-flow-client-audience") => new SignJWT({ email, type: "app" })
      .setProtectedHeader({ alg: "RS256", kid: "flow-key" })
      .setSubject("access-identity:" + email)
      .setIssuer("https://local-entry-flow.cloudflareaccess.com")
      .setAudience(audience)
      .setIssuedAt().setExpirationTime("5m").sign(privateKey);
    const route = (request: Request) => handlePrivateGalleryRoutes(request, new URL(request.url), testEnv);
    const entry = async (email: string, audience?: string) => route(new Request("http://localhost:8787/albuns/entrar", {
      headers: { "cf-access-jwt-assertion": await sign(email, audience) },
    }));
    const a = await seedClient();
    const b = await seedClient();
    const galleryA = await seedGallery(a);
    const galleryB = await seedGallery(b);
    const image = await seedReadyImage(galleryA);
    const imageRow = await env.DB.prepare(
      "SELECT storage_key AS key FROM client_gallery_images WHERE id=?",
    ).bind(image).first<{ key: string }>();
    await env.ORIGINALS.put(imageRow!.key, PNG, { httpMetadata: { contentType: "image/png" } });
    await env.DB.prepare("UPDATE client_galleries SET allow_downloads=1 WHERE id=?").bind(galleryA).run();

    const entryA = await entry(a.toUpperCase() + "@EXAMPLE.COM");
    expect(entryA?.status).toBe(303);
    expect(entryA?.headers.get("Location")).toBe("/albuns");
    expect(entryA?.headers.get("Set-Cookie")).toContain("HttpOnly; Secure; SameSite=Strict");
    const cookieA = entryA!.headers.get("Set-Cookie")!.split(";")[0];
    const entryB = await entry(b + "@example.com");
    expect(entryB?.status).toBe(303);
    const cookieB = entryB!.headers.get("Set-Cookie")!.split(";")[0];
    for (const [cookie, owned, foreign] of [[cookieA, galleryA, galleryB], [cookieB, galleryB, galleryA]]) {
      const list = await route(privateRequest("/api/client/galleries", "GET", undefined, cookie));
      expect(list?.status).toBe(200);
      expect(await list!.json()).toMatchObject({ galleries: [{ id: owned }] });
      const denied = await route(privateRequest("/api/client/galleries/" + foreign, "GET", undefined, cookie));
      expect(denied?.status).toBe(404);
      expect(denied?.headers.get("Cache-Control")).toBe("private, no-store");
    }
    const favorite = `/api/client/galleries/${galleryA}/favorites/${image}`;
    expect((await route(privateRequest(favorite, "PUT", undefined, cookieA)))?.status).toBe(200);
    expect((await route(privateRequest(favorite, "PUT", undefined, cookieB)))?.status).toBe(404);
    const media = `/api/client/galleries/${galleryA}/images/${image}/download`;
    const download = await route(privateRequest(media, "GET", undefined, cookieA));
    expect(download?.status).toBe(200);
    expect(new Uint8Array(await download!.arrayBuffer())).toEqual(PNG);
    expect(download?.headers.get("Content-Disposition")).toContain("attachment");
    expect(download?.headers.get("Cache-Control")).toBe("private, no-store");
    const foreignMedia = await route(privateRequest(media, "GET", undefined, cookieB));
    expect(foreignMedia?.status).toBe(404);
    expect((await foreignMedia!.arrayBuffer()).byteLength).toBe(0);
    expect((await entry("unregistered@example.com"))?.status).toBe(403);
    for (const audience of ["another-client-application", "local-entry-flow-admin-audience"])
      expect((await entry(a + "@example.com", audience))?.status).toBe(401);
    expect((await route(new Request("http://localhost:8787/albuns/entrar", {
      headers: { "cf-access-jwt-assertion": "forged-token" },
    })))?.status).toBe(401);

    const logout = await route(privateRequest("/api/client/session", "DELETE", undefined, cookieA));
    expect(logout?.status).toBe(200);
    expect(await logout!.json()).toMatchObject({ logoutUrl: "/cdn-cgi/access/logout" });
    expect((await route(privateRequest("/api/client/me", "GET", undefined, cookieA)))?.status).toBe(401);
    const revokedMedia = await route(privateRequest(media, "GET", undefined, cookieA));
    expect(revokedMedia?.status).toBe(404);
    expect((await revokedMedia!.arrayBuffer()).byteLength).toBe(0);
    expect((await route(privateRequest("/api/client/me", "GET", undefined, cookieB)))?.status).toBe(200);
    await env.DB.prepare("UPDATE client_accounts SET disabled_at=datetime('now') WHERE id=?").bind(a).run();
    expect((await entry(a + "@example.com"))?.status).toBe(403);
  });
});
