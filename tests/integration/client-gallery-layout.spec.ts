import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { CLIENT_GALLERY_LAYOUTS } from "../../shared/client-galleries";
import { handlePrivateGalleryRoutes } from "../../worker/client/router";
import { getGallery } from "../../worker/client/repository";
import worker from "../../worker/test-entry";
import {
  bootstrapPrivateDb,
  privateRequest,
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

function makeClerkEnv(spkiPem: string, overrides: Record<string, unknown> = {}): Env {
  return Object.assign({}, env, {
    ENVIRONMENT: "production",
    SITE_ORIGIN,
    PUBLIC_SITE_URL: SITE_ORIGIN,
    ADMIN_ALLOWED_EMAILS: ADMIN_EMAIL,
    PRIVATE_GALLERIES_ENABLED: "true",
    CLERK_AUTH_ENABLED: "true",
    ADMIN_AUTH_MODE: "clerk",
    CLIENT_AUTH_MODE: "clerk",
    CLERK_PUBLISHABLE_KEY: "pk_test_" + btoa("clerk.punctumpicture.com$"),
    CLERK_SECRET_KEY: "sk_test_synthetic_layout_matrix_secret",
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

function cookiePair(setCookie: string | null, name: string): string {
  expect(setCookie).toBeTruthy();
  const match = (setCookie ?? "")
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(name + "="));
  expect(match).toBeTruthy();
  return match!;
}

async function signJwt(privateKey: CryptoKey, sub: string, sid: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub, sid, azp: SITE_ORIGIN })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "layout-k1" })
    .setIssuer(CLERK_ISSUER)
    .setIssuedAt(now - 5)
    .setExpirationTime(now + 300)
    .sign(privateKey);
}

async function dispatch(activeEnv: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (["POST", "PUT", "PATCH", "DELETE"].includes((init.method ?? "GET").toUpperCase()) && !headers.has("Origin")) {
    headers.set("Origin", SITE_ORIGIN);
  }
  return worker.fetch(new Request(SITE_ORIGIN + path, { ...init, headers, redirect: "manual" }), activeEnv);
}

describe("private album template persistence, contracts and Clerk security", () => {
  let primaryPriv: CryptoKey;
  let primaryPem: string;

  beforeAll(async () => {
    await bootstrapPrivateDb();
    const pair = await generateKeyPair("RS256");
    primaryPriv = pair.privateKey;
    primaryPem = await exportSPKI(pair.publicKey);
  });

  it("creates galleries with default classico or any of the five allowlisted templates in draft and audits creation", async () => {
    const clientId = await seedClient();

    const defaultReq = privateRequest("/admin/api/albuns-privados", "POST", {
      clientId,
      title: "Álbum padrão",
    });
    const defaultRes = await handlePrivateGalleryRoutes(defaultReq, new URL(defaultReq.url), env);
    expect(defaultRes?.status).toBe(201);
    const defaultBody = (await defaultRes?.json()) as { gallery: { id: string; layoutPreset: string; status: string } };
    expect(defaultBody.gallery.layoutPreset).toBe("classico");
    expect(defaultBody.gallery.status).toBe("draft");

    for (const preset of CLIENT_GALLERY_LAYOUTS) {
      const req = privateRequest("/admin/api/albuns-privados", "POST", {
        clientId,
        title: `Álbum ${preset}`,
        theme: "warm",
        layoutPreset: preset,
      });
      const res = await handlePrivateGalleryRoutes(req, new URL(req.url), env);
      expect(res?.status).toBe(201);
      const created = (await res?.json()) as { gallery: { id: string; layoutPreset: string; status: string; theme: string } };
      expect(created.gallery.layoutPreset).toBe(preset);
      expect(created.gallery.status).toBe("draft");
      expect(created.gallery.theme).toBe("warm");

      const detailReq = privateRequest("/admin/api/albuns-privados/" + created.gallery.id, "GET");
      const detailRes = await handlePrivateGalleryRoutes(detailReq, new URL(detailReq.url), env);
      expect(detailRes?.status).toBe(200);
      expect(((await detailRes?.json()) as { gallery: { layoutPreset: string } }).gallery.layoutPreset).toBe(preset);

      const audit = await env.DB.prepare(
        "SELECT action FROM audit_log WHERE entity_type='client_gallery' AND entity_id=? AND action='client_gallery.created'",
      )
        .bind(created.gallery.id)
        .first<{ action: string }>();
      expect(audit?.action).toBe("client_gallery.created");
    }
  });

  it("updates the chosen template atomically with audit without altering ownership, status, cover, downloads, images or favorites", async () => {
    const clientId = await seedClient();
    const galleryId = await seedGallery(clientId, "draft");
    const img1 = await seedReadyImage(galleryId);
    const img2 = await seedReadyImage(galleryId);
    await env.DB.prepare("UPDATE client_gallery_images SET position=1 WHERE id=?").bind(img2).run();
    await env.DB.prepare("UPDATE client_galleries SET cover_image_id=? WHERE id=?").bind(img1, galleryId).run();
    await env.DB.prepare(
      "INSERT INTO client_gallery_favorites (client_id,gallery_id,image_id,created_at) VALUES (?,?,?,datetime('now'))",
    )
      .bind(clientId, galleryId, img1)
      .run();

    const before = await getGallery(env.DB, galleryId);
    for (const preset of CLIENT_GALLERY_LAYOUTS) {
      const req = privateRequest("/admin/api/albuns-privados/" + galleryId, "PATCH", { layoutPreset: preset });
      const response = await handlePrivateGalleryRoutes(req, new URL(req.url), env);
      expect(response?.status).toBe(200);
      expect(((await response?.json()) as { gallery: { layoutPreset: string } }).gallery.layoutPreset).toBe(preset);
      const after = await getGallery(env.DB, galleryId);
      expect(after?.layoutPreset).toBe(preset);
      expect(after?.clientId).toBe(clientId);
      expect(after?.status).toBe("draft");
      expect(after?.coverImageId).toBe(before?.coverImageId);
      expect(after?.allowDownloads).toBe(before?.allowDownloads);
      expect(after?.theme).toBe(before?.theme);
    }

    const order = (
      await env.DB.prepare("SELECT id, position FROM client_gallery_images WHERE gallery_id=? ORDER BY position, id")
        .bind(galleryId)
        .all<{ id: string; position: number }>()
    ).results;
    expect(order).toEqual([
      { id: img1, position: 0 },
      { id: img2, position: 1 },
    ]);
    const fav = await env.DB.prepare("SELECT COUNT(*) AS n FROM client_gallery_favorites WHERE gallery_id=?")
      .bind(galleryId)
      .first<{ n: number }>();
    expect(fav?.n).toBe(1);

    const audits = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM audit_log WHERE entity_type='client_gallery' AND entity_id=? AND action='client_gallery.updated'",
    )
      .bind(galleryId)
      .first<{ n: number }>();
    expect(audits?.n).toBe(CLIENT_GALLERY_LAYOUTS.length);
  });

  it("rejects arbitrary HTML/CSS/JS/URL template identifiers and cross-origin PATCH requests without modifying D1", async () => {
    const clientId = await seedClient();
    const galleryId = await seedGallery(clientId, "draft");
    for (const bad of ["<script>", "javascript:alert(1)", "https://evil.example/a.css", "custom-html", ""]) {
      const patchReq = privateRequest("/admin/api/albuns-privados/" + galleryId, "PATCH", { layoutPreset: bad });
      expect((await handlePrivateGalleryRoutes(patchReq, new URL(patchReq.url), env))?.status).toBe(400);

      const postReq = privateRequest("/admin/api/albuns-privados", "POST", {
        clientId,
        title: "Tentativa inválida",
        layoutPreset: bad,
      });
      expect((await handlePrivateGalleryRoutes(postReq, new URL(postReq.url), env))?.status).toBe(400);
    }
    expect((await getGallery(env.DB, galleryId))?.layoutPreset).toBe("classico");

    const crossOrigin = new Request("http://localhost:8787/admin/api/albuns-privados/" + galleryId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ layoutPreset: "cinema" }),
    });
    expect((await handlePrivateGalleryRoutes(crossOrigin, new URL(crossOrigin.url), env))?.status).toBe(403);
    expect((await getGallery(env.DB, galleryId))?.layoutPreset).toBe("classico");
  });

  it("enforces Clerk A/B isolation, client non-mutation, download bounds, media privacy, revocation and feature flag across all five templates", async () => {
    const clerkEnv = makeClerkEnv(primaryPem);
    const suffix = crypto.randomUUID().slice(0, 8);
    const adminClerkId = `user_adm_tpl_${suffix}`;
    const clientAClerkId = `user_cliA_tpl_${suffix}`;
    const clientBClerkId = `user_cliB_tpl_${suffix}`;
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO clerk_admin_identity_links (clerk_user_id, admin_principal_id, role, session_version, created_at, updated_at)
       VALUES (?, ?, 'admin', 1, ?, ?)`,
    )
      .bind(adminClerkId, ADMIN_EMAIL, now, now)
      .run();

    const clientA = await seedClient();
    const clientB = await seedClient();
    const galleryA = await seedGallery(clientA, "published");
    const galleryB = await seedGallery(clientB, "published");
    const imageA = await seedReadyImage(galleryA);
    const imageB = await seedReadyImage(galleryB);

    const pngDigest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", PNG)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const shaBytes = Uint8Array.from(pngDigest.match(/.{2}/g) ?? [], (p) => Number.parseInt(p, 16));
    await env.DB.prepare("UPDATE client_gallery_images SET size_bytes=?, original_sha256=? WHERE id IN (?,?)")
      .bind(PNG.length, pngDigest, imageA, imageB)
      .run();
    for (const imgId of [imageA, imageB]) {
      const row = await env.DB.prepare("SELECT storage_key AS storageKey FROM client_gallery_images WHERE id=?")
        .bind(imgId)
        .first<{ storageKey: string }>();
      await env.ORIGINALS.put(row!.storageKey, PNG, {
        sha256: shaBytes,
        httpMetadata: { contentType: "image/png" },
        customMetadata: { sha256: pngDigest },
      });
    }

    // Exchange Clerk RS256 admin JWT
    const adminJwt = await signJwt(primaryPriv, adminClerkId, `sess_adm_tpl_${suffix}`);
    const adminSessionRes = await dispatch(clerkEnv, "/admin/api/clerk-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminJwt}` },
    });
    expect(adminSessionRes.status).toBe(200);
    const adminCookie = cookiePair(adminSessionRes.headers.get("Set-Cookie"), "punctum_admin_session");

    // Link Client A and Client B explicitly in D1
    for (const [cid, clerkUid] of [
      [clientA, clientAClerkId],
      [clientB, clientBClerkId],
    ] as const) {
      const linkRes = await dispatch(clerkEnv, `/admin/api/clientes/${cid}/clerk-link`, {
        method: "PUT",
        headers: { Cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId: clerkUid }),
      });
      expect(linkRes.status).toBe(200);
    }

    // Admin client listing exposes linked Clerk identities and clerkEnabled for Maria's UI
    const listedClientsRes = await dispatch(clerkEnv, "/admin/api/clientes", {
      headers: { Cookie: adminCookie },
    });
    expect(listedClientsRes.status).toBe(200);
    const listedClients = (await listedClientsRes.json()) as {
      authMode: string;
      clerkEnabled: boolean;
      clients: Array<{ id: string; clerkUserId: string | null }>;
    };
    expect(listedClients.authMode).toBe("clerk");
    expect(listedClients.clerkEnabled).toBe(true);
    expect(listedClients.clients.find((c) => c.id === clientA)?.clerkUserId).toBe(clientAClerkId);
    expect(listedClients.clients.find((c) => c.id === clientB)?.clerkUserId).toBe(clientBClerkId);

    // Revoking sessions via reset-password in Clerk mode must NOT emit a temporary password
    const revokeClientBRes = await dispatch(clerkEnv, `/admin/api/clientes/${clientB}/reset-password`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(revokeClientBRes.status).toBe(200);
    const revokeClientBBody = (await revokeClientBRes.json()) as { ok?: boolean; authMode?: string; temporaryPassword?: string };
    expect(revokeClientBBody).toEqual({ ok: true, authMode: "clerk" });
    expect(revokeClientBBody.temporaryPassword).toBeUndefined();

    // Exchange Clerk RS256 client JWT for Client A
    const clientAJwt = await signJwt(primaryPriv, clientAClerkId, `sess_cliA_tpl_${suffix}`);
    const clientASessionRes = await dispatch(clerkEnv, "/api/client/clerk-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${clientAJwt}` },
    });
    expect(clientASessionRes.status).toBe(200);
    const clientACookie = cookiePair(clientASessionRes.headers.get("Set-Cookie"), "punctum_client_session");

    const linksBefore = (
      await env.DB.prepare("SELECT clerk_user_id, client_id, session_version_at_link FROM clerk_pilot_identity_links WHERE client_id IN (?,?) ORDER BY client_id")
        .bind(clientA, clientB)
        .all()
    ).results;

    // Admin cycles through all 5 templates; Client A sees exact preset, cannot access B, cannot mutate templates
    for (const preset of CLIENT_GALLERY_LAYOUTS) {
      const patchRes = await dispatch(clerkEnv, `/admin/api/albuns-privados/${galleryA}`, {
        method: "PATCH",
        headers: { Cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ layoutPreset: preset }),
      });
      expect(patchRes.status).toBe(200);

      const listRes = await dispatch(clerkEnv, "/api/client/galleries", { headers: { Cookie: clientACookie } });
      expect(listRes.status).toBe(200);
      const listJson = (await listRes.json()) as { galleries: Array<{ id: string; layoutPreset: string }> };
      expect(listJson.galleries.map((g) => g.id)).toEqual([galleryA]);
      expect(listJson.galleries[0].layoutPreset).toBe(preset);

      const detailRes = await dispatch(clerkEnv, `/api/client/galleries/${galleryA}`, {
        headers: { Cookie: clientACookie },
      });
      expect(detailRes.status).toBe(200);
      expect(((await detailRes.json()) as { gallery: { layoutPreset: string } }).gallery.layoutPreset).toBe(preset);

      // Client A cannot access Client B's gallery or media
      const foreignGallery = await dispatch(clerkEnv, `/api/client/galleries/${galleryB}`, {
        headers: { Cookie: clientACookie },
      });
      expect(foreignGallery.status).toBe(404);
      const foreignMedia = await dispatch(clerkEnv, `/api/client/galleries/${galleryB}/images/${imageB}/gallery`, {
        headers: { Cookie: clientACookie },
      });
      expect(foreignMedia.status).toBe(404);
      expect((await foreignMedia.arrayBuffer()).byteLength).toBe(0);

      // Client A cannot alter template via admin API
      const forbiddenPatch = await dispatch(clerkEnv, `/admin/api/albuns-privados/${galleryA}`, {
        method: "PATCH",
        headers: { Cookie: clientACookie, "Content-Type": "application/json" },
        body: JSON.stringify({ layoutPreset: "classico" }),
      });
      expect(forbiddenPatch.status).toBe(403);
      expect((await getGallery(env.DB, galleryA))?.layoutPreset).toBe(preset);
    }

    // Clerk/D1 identity links untouched after all template switches
    const linksAfter = (
      await env.DB.prepare("SELECT clerk_user_id, client_id, session_version_at_link FROM clerk_pilot_identity_links WHERE client_id IN (?,?) ORDER BY client_id")
        .bind(clientA, clientB)
        .all()
    ).results;
    expect(linksAfter).toEqual(linksBefore);

    // Download permission respected (off -> 403, on -> 200 with no-store and exact bytes)
    const dlOff = await dispatch(clerkEnv, `/api/client/galleries/${galleryA}/images/${imageA}/download`, {
      headers: { Cookie: clientACookie },
    });
    expect(dlOff.status).toBe(403);
    expect((await dlOff.arrayBuffer()).byteLength).toBe(0);

    await dispatch(clerkEnv, `/admin/api/albuns-privados/${galleryA}`, {
      method: "PATCH",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ allowDownloads: true }),
    });
    const dlOn = await dispatch(clerkEnv, `/api/client/galleries/${galleryA}/images/${imageA}/download`, {
      headers: { Cookie: clientACookie },
    });
    expect(dlOn.status).toBe(200);
    expect(dlOn.headers.get("Cache-Control")).toContain("no-store");
    expect(new Uint8Array(await dlOn.arrayBuffer())).toEqual(PNG);

    // Public media route never delivers private photos
    const publicLeak = await dispatch(clerkEnv, `/media/${imageA}/display`);
    expect(publicLeak.status).toBe(404);

    // Unpublish immediately revokes client gallery & media access regardless of template
    const unpub = await dispatch(clerkEnv, `/admin/api/albuns-privados/${galleryA}/unpublish`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(unpub.status).toBe(200);
    expect((await dispatch(clerkEnv, `/api/client/galleries/${galleryA}`, { headers: { Cookie: clientACookie } })).status).toBe(404);
    const deniedAfterUnpub = await dispatch(clerkEnv, `/api/client/galleries/${galleryA}/images/${imageA}/gallery`, {
      headers: { Cookie: clientACookie },
    });
    expect(deniedAfterUnpub.status).toBe(404);
    expect((await deniedAfterUnpub.arrayBuffer()).byteLength).toBe(0);

    // Republish, then verify archive denies, then verify logout revokes session + sid replay
    await env.DB.prepare("UPDATE client_galleries SET cover_image_id=? WHERE id=?").bind(imageA, galleryA).run();
    expect((await dispatch(clerkEnv, `/admin/api/albuns-privados/${galleryA}/publish`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    })).status).toBe(200);
    expect((await dispatch(clerkEnv, `/api/client/galleries/${galleryA}`, { headers: { Cookie: clientACookie } })).status).toBe(200);

    expect((await dispatch(clerkEnv, `/admin/api/albuns-privados/${galleryA}/archive`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    })).status).toBe(200);
    expect((await dispatch(clerkEnv, `/api/client/galleries/${galleryA}`, { headers: { Cookie: clientACookie } })).status).toBe(404);

    // Logout revokes client session and blocks Clerk JWT replay
    const logoutRes = await dispatch(clerkEnv, "/api/client/session", {
      method: "DELETE",
      headers: { Cookie: clientACookie, Authorization: `Bearer ${clientAJwt}` },
    });
    expect(logoutRes.status).toBe(200);
    expect((await dispatch(clerkEnv, "/api/client/me", { headers: { Cookie: clientACookie } })).status).toBe(401);
    expect((await dispatch(clerkEnv, "/api/client/clerk-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${clientAJwt}` },
    })).status).toBe(401);

    // Disabled account loses access even with a fresh Clerk session
    await env.DB.prepare("UPDATE client_galleries SET status='published' WHERE id=?").bind(galleryA).run();
    const freshJwt = await signJwt(primaryPriv, clientAClerkId, `sess_cliA_tpl2_${suffix}`);
    const freshLogin = await dispatch(clerkEnv, "/api/client/clerk-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${freshJwt}` },
    });
    expect(freshLogin.status).toBe(200);
    const freshCookie = cookiePair(freshLogin.headers.get("Set-Cookie"), "punctum_client_session");
    await env.DB.prepare("UPDATE client_accounts SET disabled_at=datetime('now') WHERE id=?").bind(clientA).run();
    expect((await dispatch(clerkEnv, `/api/client/galleries/${galleryA}`, { headers: { Cookie: freshCookie } })).status).toBe(401);

    // Feature flag PRIVATE_GALLERIES_ENABLED=false keeps all private/template routes dark
    const disabledEnv = makeClerkEnv(primaryPem, { PRIVATE_GALLERIES_ENABLED: "false" });
    expect((await dispatch(disabledEnv, `/admin/api/albuns-privados/${galleryA}`, {
      method: "PATCH",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ layoutPreset: "editorial" }),
    })).status).toBe(404);
    expect((await dispatch(disabledEnv, "/api/client/galleries", { headers: { Cookie: freshCookie } })).status).toBe(404);
  });
});
