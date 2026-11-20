import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import {
  CLERK_SESSION_REVOCATION_TTL_SECONDS,
  CLERK_TOKEN_REVOCATION_TTL_SECONDS,
  clerkRevocationTtlSeconds,
  clerkSessionIdFromRawToken,
  collectClerkRevocationKeys,
  revokeClerkSessionKeys,
  verifyClerkSessionFromRequest,
} from "../../worker/auth/clerk-auth";
import worker from "../../worker/test-entry";
import {
  bootstrapPrivateDb,
  seedClient,
  seedGallery,
  seedReadyImage,
} from "./client-fixture";

const SITE_ORIGIN = "https://punctumpicture.com";
const CLERK_ISSUER = "https://clerk.punctumpicture.com";
const ADMIN_EMAIL = "maria.helena.ifc@gmail.com";
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function makeEnv(
  spkiPem: string,
  overrides: Record<string, unknown> = {},
): Env {
  return Object.assign({}, env, {
    ENVIRONMENT: "production",
    SITE_ORIGIN,
    PUBLIC_SITE_URL: SITE_ORIGIN,
    ADMIN_ALLOWED_EMAILS: ADMIN_EMAIL,
    CLERK_AUTH_ENABLED: "true",
    ADMIN_AUTH_MODE: "clerk",
    CLIENT_AUTH_MODE: "clerk",
    CLERK_PUBLISHABLE_KEY:
      "pk_test_" + btoa("clerk.punctumpicture.com$"),
    CLERK_SECRET_KEY: "sk_test_synthetic_matrix_secret",
    CLERK_JWT_KEY: spkiPem,
    CLERK_ISSUER,
    ADMIN_LOGIN_RATE_LIMIT_MAX: "50",
    IMAGES: {
      input: () => ({
        transform: () => ({
          output: async () => ({
            response: () =>
              new Response(PNG, {
                status: 200,
                headers: { "Content-Type": "image/webp" },
              }),
          }),
        }),
      }),
    },
    ...overrides,
  }) as Env;
}

function cookieValue(setCookieHeader: string | null, name: string): string {
  expect(setCookieHeader).toBeTruthy();
  const prefix = name + "=";
  const pair = (setCookieHeader ?? "")
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(prefix));
  expect(pair).toBeTruthy();
  return pair!;
}

async function signClerkJwt(
  privateKey: CryptoKey,
  claims: {
    sub: string;
    sid?: string;
    iss?: string;
    azp?: string | null;
    expSecondsFromNow?: number;
  },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    sub: claims.sub,
    ...(claims.sid ? { sid: claims.sid } : {}),
    ...(claims.azp !== null ? { azp: claims.azp ?? SITE_ORIGIN } : {}),
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "matrix-k1" })
    .setIssuer(claims.iss ?? CLERK_ISSUER)
    .setIssuedAt(now - 5)
    .setExpirationTime(now + (claims.expSecondsFromNow ?? 300))
    .sign(privateKey);
}

async function dispatch(
  activeEnv: Env,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : SITE_ORIGIN + path;
  const headers = new Headers(init.headers);
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(
      (init.method ?? "GET").toUpperCase(),
    ) &&
    !headers.has("Origin")
  ) {
    headers.set("Origin", SITE_ORIGIN);
  }
  return worker.fetch(
    new Request(url, { ...init, headers, redirect: "manual" }),
    activeEnv,
  );
}

describe("Gate 03: Clerk + R4 + Studio security matrix (real RS256 + @clerk/backend)", () => {
  let primaryPriv: CryptoKey;
  let primaryPem: string;
  let roguePriv: CryptoKey;

  beforeAll(async () => {
    await bootstrapPrivateDb();
    const pair1 = await generateKeyPair("RS256");
    primaryPriv = pair1.privateKey;
    primaryPem = await exportSPKI(pair1.publicKey);
    const pair2 = await generateKeyPair("RS256");
    roguePriv = pair2.privateKey;
  });

  it("enforces full Admin & R4 client Clerk auth, isolation, link collision, revocation, CSRF, fail-closed & rollback", async () => {
    const clerkEnv = makeEnv(primaryPem);
    const suffix = crypto.randomUUID().slice(0, 8);
    const adminClerkUserId = `user_admin_${suffix}`;
    const outsiderClerkUserId = `user_unlinked_${suffix}`;
    const clientAClerkUserId = `user_clientA_${suffix}`;
    const rogueAdminClerkUserId = `user_disallowed_adm_${suffix}`;

    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO clerk_admin_identity_links (clerk_user_id, admin_principal_id, role, session_version, created_at, updated_at)
       VALUES (?, ?, 'admin', 1, ?, ?)`,
    )
      .bind(adminClerkUserId, ADMIN_EMAIL, now, now)
      .run();
    await env.DB.prepare(
      `INSERT INTO clerk_admin_identity_links (clerk_user_id, admin_principal_id, role, session_version, created_at, updated_at)
       VALUES (?, ?, 'admin', 1, ?, ?)`,
    )
      .bind(rogueAdminClerkUserId, `outsider-${suffix}@example.com`, now, now)
      .run();

    // Seed synthetic clients + R4 galleries + ready image objects
    const clientA = await seedClient();
    const clientB = await seedClient();
    const galleryA = await seedGallery(clientA, "published");
    await env.DB.prepare(
      "UPDATE client_galleries SET allow_downloads = 1 WHERE id = ?",
    )
      .bind(galleryA)
      .run();
    const galleryB = await seedGallery(clientB, "published");
    const imageA = await seedReadyImage(galleryA);
    const imageB = await seedReadyImage(galleryB);

    const pngDigest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", PNG)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const shaBytes = Uint8Array.from(
      pngDigest.match(/.{2}/g) ?? [],
      (p) => Number.parseInt(p, 16),
    );
    await env.DB.prepare(
      "UPDATE client_gallery_images SET size_bytes = ?, original_sha256 = ? WHERE id IN (?, ?)",
    )
      .bind(PNG.length, pngDigest, imageA, imageB)
      .run();

    const rowA = await env.DB.prepare(
      "SELECT storage_key AS storageKey FROM client_gallery_images WHERE id = ?",
    )
      .bind(imageA)
      .first<{ storageKey: string }>();
    const rowB = await env.DB.prepare(
      "SELECT storage_key AS storageKey FROM client_gallery_images WHERE id = ?",
    )
      .bind(imageB)
      .first<{ storageKey: string }>();
    await env.ORIGINALS.put(rowA!.storageKey, PNG, {
      sha256: shaBytes,
      httpMetadata: { contentType: "image/png" },
      customMetadata: { sha256: pngDigest },
    });
    await env.ORIGINALS.put(rowB!.storageKey, PNG, {
      sha256: shaBytes,
      httpMetadata: { contentType: "image/png" },
      customMetadata: { sha256: pngDigest },
    });

    // 2. Admin without session -> denied
    expect((await dispatch(clerkEnv, "/admin/api/clientes")).status).toBe(403);
    expect((await dispatch(clerkEnv, "/admin/studio/preview")).status).toBe(403);
    const anonClientRoute = await dispatch(clerkEnv, "/albuns");
    expect(anonClientRoute.status).toBe(303);
    expect(anonClientRoute.headers.get("Location")).toBe("/albuns/entrar");

    // 1. Linked Clerk admin exchanges RS256 token -> cookie & accesses Studio APIs
    const adminJwt1 = await signClerkJwt(primaryPriv, {
      sub: adminClerkUserId,
      sid: `sess_adm_1_${suffix}`,
    });
    const adminLogin = await dispatch(clerkEnv, "/admin/api/clerk-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminJwt1}` },
    });
    expect(adminLogin.status).toBe(200);
    const adminCookie = cookieValue(
      adminLogin.headers.get("Set-Cookie"),
      "punctum_admin_session",
    );

    const listClients = await dispatch(clerkEnv, "/admin/api/clientes", {
      headers: { Cookie: adminCookie },
    });
    expect(listClients.status).toBe(200);

    // Admin explicitly links Client A to user_clientA
    const linkClientA = await dispatch(
      clerkEnv,
      `/admin/api/clientes/${clientA}/clerk-link`,
      {
        method: "PUT",
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clerkUserId: clientAClerkUserId }),
      },
    );
    expect(linkClientA.status).toBe(200);

    // 11. Duplicate / hijack link attempts return 409; malformed Clerk ID returns 400
    const dupClientLink = await dispatch(
      clerkEnv,
      `/admin/api/clientes/${clientB}/clerk-link`,
      {
        method: "PUT",
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clerkUserId: clientAClerkUserId }),
      },
    );
    expect(dupClientLink.status).toBe(409);

    const hijackAdminLink = await dispatch(
      clerkEnv,
      `/admin/api/clientes/${clientB}/clerk-link`,
      {
        method: "PUT",
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clerkUserId: adminClerkUserId }),
      },
    );
    expect(hijackAdminLink.status).toBe(409);

    const invalidIdFormat = await dispatch(
      clerkEnv,
      `/admin/api/clientes/${clientB}/clerk-link`,
      {
        method: "PUT",
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clerkUserId: "invalid_not_user_prefix" }),
      },
    );
    expect(invalidIdFormat.status).toBe(400);

    // 3. Linked Client A exchanges Clerk JWT -> reads own Gallery A + thumb + download
    const clientAJwt1 = await signClerkJwt(primaryPriv, {
      sub: clientAClerkUserId,
      sid: `sess_cli_1_${suffix}`,
    });
    const clientLogin = await dispatch(clerkEnv, "/api/client/clerk-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${clientAJwt1}` },
    });
    expect(clientLogin.status).toBe(200);
    const clientACookie = cookieValue(
      clientLogin.headers.get("Set-Cookie"),
      "punctum_client_session",
    );

    const galleriesRes = await dispatch(clerkEnv, "/api/client/galleries", {
      headers: { Cookie: clientACookie },
    });
    expect(galleriesRes.status).toBe(200);
    const galleriesJson = (await galleriesRes.json()) as {
      galleries: Array<{ id: string }>;
    };
    expect(galleriesJson.galleries.map((g) => g.id)).toEqual([galleryA]);

    const thumbA = await dispatch(
      clerkEnv,
      `/api/client/galleries/${galleryA}/images/${imageA}/thumb`,
      { headers: { Cookie: clientACookie } },
    );
    expect(thumbA.status).toBe(200);
    const downloadA = await dispatch(
      clerkEnv,
      `/api/client/galleries/${galleryA}/images/${imageA}/download`,
      { headers: { Cookie: clientACookie } },
    );
    expect(downloadA.status).toBe(200);

    // 4. Client A cannot access Client B's gallery metadata or media (404, 0 bytes)
    expect(
      (
        await dispatch(clerkEnv, `/api/client/galleries/${galleryB}`, {
          headers: { Cookie: clientACookie },
        })
      ).status,
    ).toBe(404);
    for (const preset of ["thumb", "gallery", "download"]) {
      const deniedMedia = await dispatch(
        clerkEnv,
        `/api/client/galleries/${galleryB}/images/${imageB}/${preset}`,
        { headers: { Authorization: `Bearer ${clientAJwt1}` } },
      );
      expect(deniedMedia.status).toBe(404);
      expect((await deniedMedia.arrayBuffer()).byteLength).toBe(0);
    }
    // G09 completeness: cookie session + HEAD must also leak zero bytes / no body.
    for (const method of ["GET", "HEAD"] as const) {
      for (const preset of ["thumb", "gallery", "download"]) {
        const denied = await dispatch(
          clerkEnv,
          `/api/client/galleries/${galleryB}/images/${imageB}/${preset}`,
          { method, headers: { Cookie: clientACookie } },
        );
        expect(denied.status).toBe(404);
        expect((await denied.arrayBuffer()).byteLength).toBe(0);
      }
    }
    const favoriteDenied = await dispatch(
      clerkEnv,
      `/api/client/galleries/${galleryB}/favorites/${imageB}`,
      {
        method: "PUT",
        headers: { Cookie: clientACookie, "Content-Type": "application/json" },
        body: "{}",
      },
    );
    expect(favoriteDenied.status).toBe(404);
    expect(
      (
        await dispatch(
          clerkEnv,
          `/api/client/galleries/${galleryB}/favorites/${imageB}`,
          { method: "DELETE", headers: { Cookie: clientACookie } },
        )
      ).status,
    ).toBe(404);

    // 5. Authenticated Clerk user WITHOUT D1 link denied on both admin & client
    const unlinkedJwt = await signClerkJwt(primaryPriv, {
      sub: outsiderClerkUserId,
      sid: `sess_outsider_${suffix}`,
    });
    expect(
      (
        await dispatch(clerkEnv, "/api/client/clerk-session", {
          method: "POST",
          headers: { Authorization: `Bearer ${unlinkedJwt}` },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await dispatch(clerkEnv, "/admin/api/clerk-session", {
          method: "POST",
          headers: { Authorization: `Bearer ${unlinkedJwt}` },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await dispatch(clerkEnv, "/api/client/galleries", {
          headers: { Authorization: `Bearer ${unlinkedJwt}` },
        })
      ).status,
    ).toBe(403);

    // Disallowed admin email even if present in clerk_admin_identity_links -> denied
    const rogueEmailAdminJwt = await signClerkJwt(primaryPriv, {
      sub: rogueAdminClerkUserId,
      sid: `sess_disallowed_adm_${suffix}`,
    });
    expect(
      (
        await dispatch(clerkEnv, "/admin/api/clerk-session", {
          method: "POST",
          headers: { Authorization: `Bearer ${rogueEmailAdminJwt}` },
        })
      ).status,
    ).toBe(403);

    // 6. Client A Clerk token / cookie cannot access Studio admin or clerk-link
    const clientHeadersList: Array<Record<string, string>> = [
      { Authorization: `Bearer ${clientAJwt1}` },
      { Cookie: clientACookie },
    ];
    for (const headers of clientHeadersList) {
      expect(
        (await dispatch(clerkEnv, "/admin/api/clientes", { headers })).status,
      ).toBe(403);
      expect(
        (
          await dispatch(
            clerkEnv,
            `/admin/api/clientes/${clientB}/clerk-link`,
            {
              method: "PUT",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ clerkUserId: `user_hack_${suffix}` }),
            },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await dispatch(clerkEnv, "/admin/api/clerk-session", {
            method: "POST",
            headers,
          })
        ).status,
      ).toBe(403);
    }

    // 10. Unauthorized upload intents blocked for anonymous and Client A
    const unauthUploadHeaders: Array<Record<string, string>> = [
      {},
      { Cookie: clientACookie },
      { Authorization: `Bearer ${clientAJwt1}` },
    ];
    for (const headers of unauthUploadHeaders) {
      const r4Upload = await dispatch(
        clerkEnv,
        `/admin/api/albuns-privados/${galleryA}/uploads/intents`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: "x.png",
            mimeType: "image/png",
            sizeBytes: PNG.length,
            sha256: "0".repeat(64),
          }),
        },
      );
      expect(r4Upload.status).toBe(403);
      const pubUpload = await dispatch(clerkEnv, "/admin/api/uploads/intents", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          albumId: galleryA,
          filename: "x.png",
          mimeType: "image/png",
          sizeBytes: PNG.length,
          sha256: "0".repeat(64),
        }),
      });
      expect(pubUpload.status).toBe(403);
    }

    // 7. Tampered / rogue-key / expired / wrong-issuer / wrong-azp JWTs rejected
    const rogueKeyJwt = await signClerkJwt(roguePriv, {
      sub: adminClerkUserId,
      sid: `sess_rogue_${suffix}`,
    });
    const expiredJwt = await signClerkJwt(primaryPriv, {
      sub: adminClerkUserId,
      expSecondsFromNow: -10,
    });
    const wrongIssuerJwt = await signClerkJwt(primaryPriv, {
      sub: adminClerkUserId,
      iss: "https://evil-clerk.example",
    });
    const wrongAzpJwt = await signClerkJwt(primaryPriv, {
      sub: adminClerkUserId,
      azp: "https://evil.example",
    });
    const missingSidAdminJwt = await signClerkJwt(primaryPriv, {
      sub: adminClerkUserId,
    });
    const parts = adminJwt1.split(".");
    const tamperedJwt = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}AAAA`;

    for (const badToken of [
      rogueKeyJwt,
      expiredJwt,
      wrongIssuerJwt,
      wrongAzpJwt,
      tamperedJwt,
      missingSidAdminJwt,
    ]) {
      expect(
        (
          await dispatch(clerkEnv, "/admin/api/clerk-session", {
            method: "POST",
            headers: { Authorization: `Bearer ${badToken}` },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await dispatch(clerkEnv, "/admin/api/clientes", {
            headers: { Authorization: `Bearer ${badToken}` },
          })
        ).status,
      ).toBe(403);
    }
    const rogueClientJwt = await signClerkJwt(roguePriv, {
      sub: clientAClerkUserId,
    });
    expect(
      (
        await dispatch(clerkEnv, "/api/client/clerk-session", {
          method: "POST",
          headers: { Authorization: `Bearer ${rogueClientJwt}` },
        })
      ).status,
    ).toBe(401);
    const missingSidClientJwt = await signClerkJwt(primaryPriv, {
      sub: clientAClerkUserId,
    });
    expect(
      (
        await dispatch(clerkEnv, "/api/client/clerk-session", {
          method: "POST",
          headers: { Authorization: `Bearer ${missingSidClientJwt}` },
        })
      ).status,
    ).toBe(401);

    // 9. CSRF / invalid Origin blocked on sensitive mutations
    const badOriginAdmin = await worker.fetch(
      new Request(SITE_ORIGIN + "/admin/api/clerk-session", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          Authorization: `Bearer ${adminJwt1}`,
        },
      }),
      clerkEnv,
    );
    expect(badOriginAdmin.status).toBe(403);
    const badOriginClient = await worker.fetch(
      new Request(SITE_ORIGIN + "/api/client/clerk-session", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          Authorization: `Bearer ${clientAJwt1}`,
        },
      }),
      clerkEnv,
    );
    expect(badOriginClient.status).toBe(403);

    // 8a. Client logout revokes cookie + old Clerk JWT, while fresh Clerk session succeeds
    const clientLogout = await dispatch(clerkEnv, "/api/client/session", {
      method: "DELETE",
      headers: { Cookie: clientACookie },
    });
    expect(clientLogout.status).toBe(200);
    expect(
      (
        await dispatch(clerkEnv, "/api/client/galleries", {
          headers: { Cookie: clientACookie },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await dispatch(clerkEnv, "/api/client/galleries", {
          headers: { Authorization: `Bearer ${clientAJwt1}` },
        })
      ).status,
    ).toBe(401);

    const clientAJwt2 = await signClerkJwt(primaryPriv, {
      sub: clientAClerkUserId,
      sid: `sess_cli_2_${suffix}`,
    });
    const clientRelogin = await dispatch(clerkEnv, "/api/client/clerk-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${clientAJwt2}` },
    });
    expect(clientRelogin.status).toBe(200);
    const clientACookie2 = cookieValue(
      clientRelogin.headers.get("Set-Cookie"),
      "punctum_client_session",
    );

    // 8b. Admin unlink revokes active Clerk session & cookie immediately
    const unlinkRes = await dispatch(
      clerkEnv,
      `/admin/api/clientes/${clientA}/clerk-link`,
      {
        method: "DELETE",
        headers: { Cookie: adminCookie },
      },
    );
    expect(unlinkRes.status).toBe(200);
    expect(
      (
        await dispatch(clerkEnv, "/api/client/galleries", {
          headers: { Cookie: clientACookie2 },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await dispatch(clerkEnv, "/api/client/galleries", {
          headers: { Authorization: `Bearer ${clientAJwt2}` },
        })
      ).status,
    ).toBe(403);

    // 8c. Admin logout revokes old admin cookie & old Clerk JWT; fresh admin JWT works
    const adminLogout = await dispatch(clerkEnv, "/admin/api/session", {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(adminLogout.status).toBe(200);
    expect(await adminLogout.json()).toMatchObject({ ok: true, authSource: "clerk" });
    expect(
      (
        await dispatch(clerkEnv, "/admin/api/clientes", {
          headers: { Cookie: adminCookie },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await dispatch(clerkEnv, "/admin/api/clientes", {
          headers: { Authorization: `Bearer ${adminJwt1}` },
        })
      ).status,
    ).toBe(403);

    const adminJwt2 = await signClerkJwt(primaryPriv, {
      sub: adminClerkUserId,
      sid: `sess_adm_2_${suffix}`,
    });
    const adminRelogin = await dispatch(clerkEnv, "/admin/api/clerk-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminJwt2}` },
    });
    expect(adminRelogin.status).toBe(200);
    const adminCookie2 = cookieValue(
      adminRelogin.headers.get("Set-Cookie"),
      "punctum_admin_session",
    );

    // 12a. Strict clerk mode disables legacy password logins & password change routes
    expect(
      (
        await dispatch(clerkEnv, "/admin/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: ADMIN_EMAIL, password: "any-password" }),
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await dispatch(clerkEnv, "/api/client/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "x@example.com", password: "any-password" }),
        })
      ).status,
    ).toBe(405);
    expect(
      (await dispatch(clerkEnv, "/albuns/trocar-senha")).status,
    ).toBe(404);

    // 12b. Missing Clerk config fails closed
    const brokenClerkEnv = makeEnv(primaryPem, { CLERK_JWT_KEY: undefined });
    expect(
      (
        await dispatch(brokenClerkEnv, "/admin/api/clerk-session", {
          method: "POST",
          headers: { Authorization: `Bearer ${adminJwt2}` },
        })
      ).status,
    ).toBe(503);
    expect(
      (
        await dispatch(brokenClerkEnv, "/api/client/clerk-session", {
          method: "POST",
          headers: { Authorization: `Bearer ${clientAJwt2}` },
        })
      ).status,
    ).toBe(503);

    // 12c. Auth rollback to legacy mode disables Clerk endpoints & rejects Clerk cookies
    const rollbackEnv = makeEnv(primaryPem, {
      CLERK_AUTH_ENABLED: "false",
      ADMIN_AUTH_MODE: "legacy",
      CLIENT_AUTH_MODE: "password",
    });
    expect(
      (
        await dispatch(rollbackEnv, "/admin/api/clerk-session", {
          method: "POST",
          headers: { Authorization: `Bearer ${adminJwt2}` },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await dispatch(rollbackEnv, "/api/client/clerk-session", {
          method: "POST",
          headers: { Authorization: `Bearer ${clientAJwt2}` },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await dispatch(rollbackEnv, "/admin/api/clientes", {
          headers: { Cookie: adminCookie2 },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await dispatch(rollbackEnv, "/api/client/galleries", {
          headers: { Cookie: clientACookie2 },
        })
      ).status,
    ).toBe(401);

    // Re-link disabled client fails cleanly with 404 NOT_FOUND; disable revokes active Clerk session
    await dispatch(
      clerkEnv,
      `/admin/api/clientes/${clientA}/clerk-link`,
      {
        method: "PUT",
        headers: {
          Cookie: adminCookie2,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clerkUserId: clientAClerkUserId }),
      },
    );
    await dispatch(clerkEnv, `/admin/api/clientes/${clientA}`, {
      method: "PATCH",
      headers: {
        Cookie: adminCookie2,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ disabled: true }),
    });
    expect(
      (
        await dispatch(clerkEnv, "/api/client/clerk-session", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await signClerkJwt(primaryPriv, {
              sub: clientAClerkUserId,
              sid: `sess_cli_3_${suffix}`,
            })}`,
          },
        })
      ).status,
    ).toBe(403);
  });

  it("revokes existing Clerk client cookies on identity rebind without revoking an idempotent link", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const rebindAdminEmail = `qa-admin-rebind-${suffix}@example.test`;
    const clerkEnv = makeEnv(primaryPem, {
      ADMIN_ALLOWED_EMAILS: `${ADMIN_EMAIL},${rebindAdminEmail}`,
    });
    const priorUserId = `user_old_${suffix}`;
    const nextUserId = `user_new_${suffix}`;
    const adminUserId = `user_admin_rebind_${suffix}`;
    const clientId = await seedClient();
    const galleryId = await seedGallery(clientId, "published");
    const imageId = await seedReadyImage(galleryId);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO clerk_admin_identity_links
       (clerk_user_id, admin_principal_id, role, session_version, created_at, updated_at)
       VALUES (?, ?, 'admin', 1, ?, ?)`,
    ).bind(adminUserId, rebindAdminEmail, now, now).run();

    const adminToken = await signClerkJwt(primaryPriv, {
      sub: adminUserId, sid: `sess_rebind_admin_${suffix}`,
    });
    const adminResponse = await dispatch(clerkEnv, "/admin/api/clerk-session", {
      method: "POST", headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminResponse.status).toBe(200);
    const adminCookie = cookieValue(adminResponse.headers.get("Set-Cookie"), "punctum_admin_session");
    const link = (clerkUserId: string) => dispatch(clerkEnv, `/admin/api/clientes/${clientId}/clerk-link`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ clerkUserId }),
    });
    const login = async (clerkUserId: string, sid: string) => {
      const token = await signClerkJwt(primaryPriv, { sub: clerkUserId, sid });
      const response = await dispatch(clerkEnv, "/api/client/clerk-session", {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
      return cookieValue(response.headers.get("Set-Cookie"), "punctum_client_session");
    };

    expect((await link(priorUserId)).status).toBe(200);
    const oldCookie = await login(priorUserId, `sess_old_${suffix}`);
    expect((await dispatch(clerkEnv, "/api/client/galleries", { headers: { Cookie: oldCookie } })).status).toBe(200);

    // A no-op relink must not invalidate an existing authorized session.
    expect((await link(priorUserId)).status).toBe(200);
    expect((await dispatch(clerkEnv, "/api/client/galleries", { headers: { Cookie: oldCookie } })).status).toBe(200);

    // Rebinding a customer account must revoke the previous identity's Punctum cookie,
    // not merely prevent the previous Clerk JWT from exchanging a new cookie.
    expect((await link(nextUserId)).status).toBe(200);
    for (const [path, method] of [
      ["/api/client/galleries", "GET"],
      [`/api/client/galleries/${galleryId}`, "GET"],
      [`/api/client/galleries/${galleryId}/images/${imageId}/download`, "GET"],
      [`/api/client/galleries/${galleryId}/images/${imageId}/thumb`, "HEAD"],
      [`/api/client/galleries/${galleryId}/favorites/${imageId}`, "PUT"],
    ] as const) {
      const response = await dispatch(clerkEnv, path, {
        method, headers: { Cookie: oldCookie },
      });
      expect(response.status, `stale cookie allowed ${method} ${path}`).toBe(
        path.includes("/images/") ? 404 : 401,
      );
      if (path.includes("/images/")) expect((await response.arrayBuffer()).byteLength).toBe(0);
    }

    const nextCookie = await login(nextUserId, `sess_new_${suffix}`);
    const fresh = await dispatch(clerkEnv, "/api/client/galleries", { headers: { Cookie: nextCookie } });
    expect(fresh.status).toBe(200);
    expect(((await fresh.json()) as { galleries: Array<{ id: string }> }).galleries.map((g) => g.id)).toContain(galleryId);
  });

  it("keeps sid revocations alive beyond the 24h token digest TTL and extracts sid on logout", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const sid = `sess_ttl_${suffix}`;
    const tokenKey = `tk:fixture_${suffix}`;
    expect(clerkRevocationTtlSeconds(`sid:${sid}`)).toBe(CLERK_SESSION_REVOCATION_TTL_SECONDS);
    expect(clerkRevocationTtlSeconds(tokenKey)).toBe(CLERK_TOKEN_REVOCATION_TTL_SECONDS);
    expect(CLERK_SESSION_REVOCATION_TTL_SECONDS).toBeGreaterThan(CLERK_TOKEN_REVOCATION_TTL_SECONDS);

    await revokeClerkSessionKeys(env.DB, [`sid:${sid}`, tokenKey]);
    const rows = await env.DB.prepare(
      `SELECT revocation_key AS key, expires_at AS expiresAt
       FROM revoked_clerk_tokens
       WHERE revocation_key IN (?, ?)
       ORDER BY revocation_key`,
    )
      .bind(`sid:${sid}`, tokenKey)
      .all<{ key: string; expiresAt: string }>();
    const byKey = new Map(rows.results.map((row) => [row.key, Date.parse(row.expiresAt)]));
    const now = Date.now();
    const sidExpiry = byKey.get(`sid:${sid}`);
    const tokenExpiry = byKey.get(tokenKey);
    expect(sidExpiry).toBeDefined();
    expect(tokenExpiry).toBeDefined();
    expect(sidExpiry! - now).toBeGreaterThan(CLERK_TOKEN_REVOCATION_TTL_SECONDS * 1000);
    expect(sidExpiry! - now).toBeGreaterThan(12 * 24 * 60 * 60 * 1000);
    expect(tokenExpiry! - now).toBeLessThan(2 * 24 * 60 * 60 * 1000);

    // After the token digest would have expired, the sid block must still deny replay.
    await env.DB.prepare(
      `UPDATE revoked_clerk_tokens SET expires_at = ?
       WHERE revocation_key = ?`,
    )
      .bind(new Date(now - 60_000).toISOString(), tokenKey)
      .run();
    const stillBlocked = await verifyClerkSessionFromRequest(
      new Request(`${SITE_ORIGIN}/api/client/me`),
      makeEnv(primaryPem),
      {
        verifier: async () => ({
          clerkUserId: `user_ttl_${suffix}`,
          sessionId: sid,
        }),
      },
    );
    expect(stillBlocked).toBeNull();

    const jwt = await signClerkJwt(primaryPriv, {
      sub: `user_collect_${suffix}`,
      sid,
    });
    expect(clerkSessionIdFromRawToken(jwt)).toBe(sid);
    const collected = await collectClerkRevocationKeys(
      new Request(`${SITE_ORIGIN}/api/client/session`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
    );
    expect(collected).toEqual(
      expect.arrayContaining([`sid:${sid}`, expect.stringMatching(/^tk:[a-f0-9]{64}$/)]),
    );
  });

  it("fails closed if the Clerk token-revocation migration is missing", async () => {
    const missingTable = new Error("D1_ERROR: no such table: revoked_clerk_tokens");
    const missingDb = {
      prepare: () => ({
        bind: () => ({
          run: async () => { throw missingTable; },
          first: async () => { throw missingTable; },
        }),
      }),
    } as unknown as D1Database;
    await expect(revokeClerkSessionKeys(missingDb, ["sid:sess_fixture"])).rejects.toThrow(
      /Revogação da sessão indisponível/,
    );
    const clerkEnv = makeEnv(primaryPem, { DB: missingDb });
    const session = await verifyClerkSessionFromRequest(
      new Request(`${SITE_ORIGIN}/api/client/me`), clerkEnv,
      { verifier: async () => ({ clerkUserId: "user_missing_migration", sessionId: "sess_fixture" }) },
    );
    expect(session).toBeNull();
  });

  it("never reports successful admin logout when Clerk revocation storage fails", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const adminPrincipal = `qa-admin-logout-${suffix}@example.test`;
    const adminUserId = `user_admin_logout_${suffix}`;
    const activeEnv = makeEnv(primaryPem, { ADMIN_ALLOWED_EMAILS: adminPrincipal });
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO clerk_admin_identity_links
       (clerk_user_id, admin_principal_id, role, session_version, created_at, updated_at)
       VALUES (?, ?, 'admin', 1, ?, ?)`,
    ).bind(adminUserId, adminPrincipal, now, now).run();
    const adminToken = await signClerkJwt(primaryPriv, {
      sub: adminUserId, sid: `sess_logout_${suffix}`,
    });
    const loginResponse = await dispatch(activeEnv, "/admin/api/clerk-session", {
      method: "POST", headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(loginResponse.status).toBe(200);
    const cookie = cookieValue(loginResponse.headers.get("Set-Cookie"), "punctum_admin_session");

    // A transient identity-link read failure is not an anonymous logout.
    // Reporting 200 would strand a still-valid copied admin cookie.
    const unreadableDb = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "prepare") {
          return (sql: string) => {
            if (sql.includes("FROM clerk_admin_identity_links")) {
              throw new Error("D1_ERROR: simulated identity-link read failure");
            }
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const unreadableEnv = makeEnv(primaryPem, {
      DB: unreadableDb, ADMIN_ALLOWED_EMAILS: adminPrincipal,
    });
    const readFailure = await dispatch(unreadableEnv, "/admin/api/session", {
      method: "DELETE", headers: { Cookie: cookie },
    });
    expect(readFailure.status).toBe(503);
    expect((await dispatch(activeEnv, "/admin/api/clientes", {
      headers: { Cookie: cookie },
    })).status).toBe(200);

    // Missing DB binding must not acknowledge logout for an active cookie.
    const noDbEnv = makeEnv(primaryPem, {
      DB: undefined, ADMIN_ALLOWED_EMAILS: adminPrincipal,
    });
    const missingBinding = await dispatch(noDbEnv, "/admin/api/session", {
      method: "DELETE", headers: { Cookie: cookie },
    });
    expect(missingBinding.status).toBe(503);
    expect((await dispatch(activeEnv, "/admin/api/clientes", {
      headers: { Cookie: cookie },
    })).status).toBe(200);

    const brokenDb = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === "prepare") {
          return (sql: string) => {
            if (sql.includes("revoked_clerk_tokens")) {
              throw new Error("D1_ERROR: no such table: revoked_clerk_tokens");
            }
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const brokenEnv = makeEnv(primaryPem, {
      DB: brokenDb, ADMIN_ALLOWED_EMAILS: adminPrincipal,
    });
    const failure = await dispatch(brokenEnv, "/admin/api/session", {
      method: "DELETE", headers: { Cookie: cookie },
    });
    expect(failure.status).toBe(503);
    expect((await failure.json()) as unknown).not.toMatchObject({ ok: true });
  });
});
