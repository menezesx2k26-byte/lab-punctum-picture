import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  bootstrapPrivateDb,
  privateRequest,
  seedClient,
  seedGallery,
  seedReadyImage,
} from "./client-fixture";
import { createClientSession } from "../../worker/client/auth";
import { requireAdmin } from "../../worker/utils/auth";

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

describe("complete A1 / A2 / B1 security matrix and zero-byte media denials", () => {
  beforeAll(bootstrapPrivateDb);

  it("enforces zero bytes and zero sensitive headers on all A1, A2 and B1 media denials (GET, HEAD and /_vinext/image)", async () => {
    const clientA = await seedClient();
    const clientB = await seedClient();
    const galleryA = await seedGallery(clientA, "published");
    const draftGalleryA = await seedGallery(clientA, "draft");
    const imageA = await seedReadyImage(galleryA);
    const draftImageA = await seedReadyImage(draftGalleryA);

    const row = await env.DB.prepare(
      "SELECT storage_key AS storageKey FROM client_gallery_images WHERE id = ?",
    )
      .bind(imageA)
      .first<{ storageKey: string }>();
    await env.ORIGINALS.put(row!.storageKey, PNG, {
      httpMetadata: { contentType: "image/png" },
    });

    const cookieA =
      "punctum_client_session=" +
      (await createClientSession({ id: clientA, sessionVersion: 1 }, env));
    const cookieB =
      "punctum_client_session=" +
      (await createClientSession({ id: clientB, sessionVersion: 1 }, env));

    const deniedCases: Array<{
      label: string;
      url: string;
      method: "GET" | "HEAD";
      cookie?: string;
      expectedStatuses: number[];
    }> = [
      // A1: Anonymous trying client media
      {
        label: "A1 GET thumb",
        url: `https://punctumpicture.com/api/client/galleries/${galleryA}/images/${imageA}/thumb`,
        method: "GET",
        expectedStatuses: [401, 404],
      },
      {
        label: "A1 HEAD gallery",
        url: `https://punctumpicture.com/api/client/galleries/${galleryA}/images/${imageA}/gallery`,
        method: "HEAD",
        expectedStatuses: [401, 404],
      },
      {
        label: "A1 GET admin media",
        url: `https://punctumpicture.com/admin/api/albuns-privados/${galleryA}/images/${imageA}/thumb`,
        method: "GET",
        expectedStatuses: [401, 403],
      },
      // A2: Client B trying Client A media
      {
        label: "A2 GET thumb",
        url: `http://localhost:8787/api/client/galleries/${galleryA}/images/${imageA}/thumb`,
        method: "GET",
        cookie: cookieB,
        expectedStatuses: [404],
      },
      {
        label: "A2 GET gallery",
        url: `http://localhost:8787/api/client/galleries/${galleryA}/images/${imageA}/gallery`,
        method: "GET",
        cookie: cookieB,
        expectedStatuses: [404],
      },
      {
        label: "A2 GET download",
        url: `http://localhost:8787/api/client/galleries/${galleryA}/images/${imageA}/download`,
        method: "GET",
        cookie: cookieB,
        expectedStatuses: [404],
      },
      {
        label: "A2 HEAD thumb",
        url: `http://localhost:8787/api/client/galleries/${galleryA}/images/${imageA}/thumb`,
        method: "HEAD",
        cookie: cookieB,
        expectedStatuses: [404],
      },
      // B1: Client A trying disabled download, draft gallery, or admin media on production host
      {
        label: "B1 GET download when allow_downloads=0",
        url: `http://localhost:8787/api/client/galleries/${galleryA}/images/${imageA}/download`,
        method: "GET",
        cookie: cookieA,
        expectedStatuses: [403],
      },
      {
        label: "B1 HEAD download when allow_downloads=0",
        url: `http://localhost:8787/api/client/galleries/${galleryA}/images/${imageA}/download`,
        method: "HEAD",
        cookie: cookieA,
        expectedStatuses: [403],
      },
      {
        label: "B1 GET draft gallery image",
        url: `http://localhost:8787/api/client/galleries/${draftGalleryA}/images/${draftImageA}/thumb`,
        method: "GET",
        cookie: cookieA,
        expectedStatuses: [404],
      },
      {
        label: "B1 Client A cookie on admin private media route",
        url: `https://punctumpicture.com/admin/api/albuns-privados/${galleryA}/images/${imageA}/thumb`,
        method: "GET",
        cookie: cookieA,
        expectedStatuses: [403],
      },
      // /_vinext/image bypass attempts (including double-encoded traversal and storage key prefix)
      {
        label: "vinext direct private gallery path",
        url: `http://localhost:8787/_vinext/image?url=${encodeURIComponent(`/api/client/galleries/${galleryA}/images/${imageA}/gallery`)}&w=640&q=75`,
        method: "GET",
        cookie: cookieA,
        expectedStatuses: [404],
      },
      {
        label: "vinext double-encoded relative traversal to private gallery",
        url: `http://localhost:8787/_vinext/image?url=/public/%252e%252e/api/client/galleries/${galleryA}/images/${imageA}/gallery&w=640&q=75`,
        method: "GET",
        cookie: cookieA,
        expectedStatuses: [404],
      },
      {
        label: "vinext storage key prefix reference",
        url: `http://localhost:8787/_vinext/image?url=/${row!.storageKey}&w=640&q=75`,
        method: "GET",
        cookie: cookieA,
        expectedStatuses: [404],
      },
    ];

    for (const testCase of deniedCases) {
      const headers = new Headers();
      if (testCase.cookie) headers.set("Cookie", testCase.cookie);
      const response = await exports.default.fetch(
        new Request(testCase.url, { method: testCase.method, headers }),
      );
      expect(
        testCase.expectedStatuses,
        `${testCase.label} returned unexpected status ${response.status}`,
      ).toContain(response.status);
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(
        bytes.byteLength,
        `${testCase.label} leaked ${bytes.byteLength} bytes`,
      ).toBe(0);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
      expect(response.headers.has("ETag")).toBe(false);
      expect(response.headers.has("Content-Disposition")).toBe(false);
      expect(response.headers.has("Last-Modified")).toBe(false);
    }
  });

  it("blocks B1 privilege escalation when a client email presents a Cloudflare Access JWT to requireAdmin", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256", {
      extractable: true,
    });
    const jwk = await exportJWK(publicKey);
    jwk.kid = "admin-access-key";
    jwk.use = "sig";
    jwk.alg = "RS256";
    const jwks = createLocalJWKSet({ keys: [jwk] });

    const testEnv = {
      ...env,
      ENVIRONMENT: "production",
      CLOUDFLARE_TEAM_DOMAIN: "punctum.cloudflareaccess.com",
      CLOUDFLARE_ACCESS_AUD: "admin-aud-distinct-from-client",
      CLIENT_ACCESS_TEAM_DOMAIN: "punctum.cloudflareaccess.com",
      CLIENT_ACCESS_AUD: "client-aud-distinct-from-admin",
      ADMIN_ALLOWED_EMAILS: "maria.helena.ifc@gmail.com,menezesx2k26@gmail.com",
    } as Env;

    const signAccessToken = (email: string) =>
      new SignJWT({ email, type: "app" })
        .setProtectedHeader({ alg: "RS256", kid: "admin-access-key" })
        .setSubject("sub-" + email)
        .setIssuer("https://punctum.cloudflareaccess.com")
        .setAudience("admin-aud-distinct-from-client")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

    const clientAssertion = await signAccessToken("cliente@example.com");
    await expect(
      requireAdmin(
        new Request("https://punctumpicture.com/admin/api/clientes", {
          headers: { "cf-access-jwt-assertion": clientAssertion },
        }),
        testEnv,
        jwks,
      ),
    ).rejects.toMatchObject({ status: 403, code: "ADMIN_UNAUTHORIZED" });

    const adminAssertion = await signAccessToken("Maria.Helena.IFC@gmail.com");
    const adminIdentity = await requireAdmin(
      new Request("https://punctumpicture.com/admin/api/clientes", {
        headers: { "cf-access-jwt-assertion": adminAssertion },
      }),
      testEnv,
      jwks,
    );
    expect(adminIdentity).toEqual({
      email: "maria.helena.ifc@gmail.com",
      roles: ["admin"],
    });
  });

  it("serves a sanitized LGPD titular data export for Admin and denies A1/B1 callers", async () => {
    const clientA = await seedClient();
    const clientB = await seedClient();
    const galleryA = await seedGallery(clientA, "published");
    const galleryB = await seedGallery(clientB, "published");
    const imageA = await seedReadyImage(galleryA);
    await seedReadyImage(galleryB);

    const cookieA =
      "punctum_client_session=" +
      (await createClientSession({ id: clientA, sessionVersion: 1 }, env));

    await exports.default.fetch(
      privateRequest(
        `/api/client/galleries/${galleryA}/favorites/${imageA}`,
        "PUT",
        undefined,
        cookieA,
      ),
    );

    // A1 and B1 must be denied on /admin/api/clientes/:clientId/lgpd-export
    const unauth = await exports.default.fetch(
      new Request(
        `https://punctumpicture.com/admin/api/clientes/${clientA}/lgpd-export`,
      ),
    );
    expect(unauth.status).toBe(403);

    const b1Attempt = await exports.default.fetch(
      new Request(
        `https://punctumpicture.com/admin/api/clientes/${clientA}/lgpd-export`,
        { headers: { Cookie: cookieA } },
      ),
    );
    expect(b1Attempt.status).toBe(403);

    // Admin export for Client A
    const exportRes = await exports.default.fetch(
      privateRequest(`/admin/api/clientes/${clientA}/lgpd-export`, "GET"),
    );
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get("Cache-Control")).toBe("private, no-store");
    expect(exportRes.headers.get("X-Robots-Tag")).toContain("noindex");
    const bodyText = await exportRes.text();
    expect(bodyText).not.toMatch(
      /passwordHash|password_hash|passwordSalt|password_salt|passwordIterations|password_iterations|sessionVersion|session_version|storageKey|storage_key|client-galleries\//,
    );
    expect(bodyText).not.toContain(clientB);
    expect(bodyText).not.toContain(galleryB);

    const parsed = JSON.parse(bodyText) as {
      schemaVersion: number;
      titular: { id: string };
      galleries: Array<{ id: string; images: Array<{ id: string }> }>;
      favorites: Array<{ galleryId: string; imageId: string }>;
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.titular.id).toBe(clientA);
    expect(parsed.galleries.map((g) => g.id)).toEqual([galleryA]);
    expect(parsed.galleries[0].images.map((i) => i.id)).toEqual([imageA]);
    expect(parsed.favorites).toEqual([
      {
        galleryId: galleryA,
        imageId: imageA,
        createdAt: expect.any(String),
      },
    ]);
  });
});
