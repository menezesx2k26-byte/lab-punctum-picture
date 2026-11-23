import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import worker from "../../worker/test-entry";
import { handleClientAdminApi } from "../../worker/api/client-admin";
import {
  bootstrapPrivateDb,
  seedClient,
  seedGallery,
  seedReadyImage,
} from "./client-fixture";

const SITE_ORIGIN = "https://punctumpicture.com";
const CLERK_ISSUER = "https://clerk.punctumpicture.com";
const ADMIN_EMAIL = "maria.helena.ifc@gmail.com";

function makeClerkEnv(
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
    CLERK_PUBLISHABLE_KEY: "pk_test_" + btoa("clerk.punctumpicture.com$"),
    CLERK_SECRET_KEY: "sk_test_synthetic_workflow_secret",
    CLERK_JWT_KEY: spkiPem,
    CLERK_ISSUER,
    ADMIN_LOGIN_RATE_LIMIT_MAX: "100",
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
  claims: { sub: string; sid: string },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: claims.sub,
    sid: claims.sid,
    azp: SITE_ORIGIN,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "workflow-k1" })
    .setIssuer(CLERK_ISSUER)
    .setIssuedAt(now - 5)
    .setExpirationTime(now + 300)
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

describe("Studio UI/UX backend workflows (Clerk lookup/invite, draft transfer, counts)", () => {
  let privKey: CryptoKey;
  let pubPem: string;
  let adminCookie: string;
  let clientACookie: string;
  let clerkEnv: Env;
  let clientAId: string;
  let clientAEmail: string;
  let clientBId: string;

  beforeAll(async () => {
    await bootstrapPrivateDb();
    const pair = await generateKeyPair("RS256");
    privKey = pair.privateKey;
    pubPem = await exportSPKI(pair.publicKey);
    clerkEnv = makeClerkEnv(pubPem);

    const suffix = crypto.randomUUID().slice(0, 8);
    const adminClerkUserId = `user_adm_wf_${suffix}`;
    const clientAClerkUserId = `user_cli_wf_${suffix}`;
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO clerk_admin_identity_links (clerk_user_id, admin_principal_id, role, session_version, created_at, updated_at)
       VALUES (?, ?, 'admin', 1, ?, ?)`,
    )
      .bind(adminClerkUserId, ADMIN_EMAIL, now, now)
      .run();

    clientAId = await seedClient();
    clientBId = await seedClient();
    const rowA = await env.DB.prepare(
      "SELECT email FROM client_accounts WHERE id = ?",
    )
      .bind(clientAId)
      .first<{ email: string }>();
    clientAEmail = rowA!.email;

    const adminLogin = await dispatch(clerkEnv, "/admin/api/clerk-session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await signClerkJwt(privKey, {
          sub: adminClerkUserId,
          sid: `sess_adm_${suffix}`,
        })}`,
      },
    });
    expect(adminLogin.status).toBe(200);
    adminCookie = cookieValue(
      adminLogin.headers.get("Set-Cookie"),
      "punctum_admin_session",
    );

    const linkRes = await dispatch(
      clerkEnv,
      `/admin/api/clientes/${clientAId}/clerk-link`,
      {
        method: "PUT",
        headers: {
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clerkUserId: clientAClerkUserId }),
      },
    );
    expect(linkRes.status).toBe(200);

    const clientLogin = await dispatch(clerkEnv, "/api/client/clerk-session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await signClerkJwt(privKey, {
          sub: clientAClerkUserId,
          sid: `sess_cli_${suffix}`,
        })}`,
      },
    });
    expect(clientLogin.status).toBe(200);
    clientACookie = cookieValue(
      clientLogin.headers.get("Set-Cookie"),
      "punctum_client_session",
    );
  });

  it("protects Clerk lookup and invite routes with admin session, origin check, email validation and secret config", async () => {
    expect(
      (
        await dispatch(
          clerkEnv,
          `/admin/api/clientes/clerk-lookup?email=${encodeURIComponent(clientAEmail)}`,
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await dispatch(
          clerkEnv,
          `/admin/api/clientes/clerk-lookup?email=${encodeURIComponent(clientAEmail)}`,
          { headers: { Cookie: clientACookie } },
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await dispatch(
          clerkEnv,
          `/admin/api/clientes/${clientBId}/clerk-invite`,
          { method: "POST", headers: { Cookie: clientACookie } },
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await dispatch(
          clerkEnv,
          `/admin/api/clientes/${clientBId}/clerk-invite`,
          {
            method: "POST",
            headers: {
              Cookie: adminCookie,
              Origin: "https://evil.example",
            },
          },
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await dispatch(
          clerkEnv,
          "/admin/api/clientes/clerk-lookup?email=not-an-email",
          { headers: { Cookie: adminCookie } },
        )
      ).status,
    ).toBe(400);

    const noSecretEnv = makeClerkEnv(pubPem, { CLERK_SECRET_KEY: "" });
    expect(
      (
        await dispatch(
          noSecretEnv,
          `/admin/api/clientes/clerk-lookup?email=${encodeURIComponent(clientAEmail)}`,
          { headers: { Cookie: adminCookie } },
        )
      ).status,
    ).toBe(503);

    expect(
      (
        await dispatch(
          noSecretEnv,
          `/admin/api/clientes/${clientBId}/clerk-invite`,
          { method: "POST", headers: { Cookie: adminCookie } },
        )
      ).status,
    ).toBe(503);
  });

  it("looks up users and sends Clerk invitations by e-mail without auto-linking D1 accounts", async () => {
    const invitedCalls: Array<{ emailAddress: string; redirectUrl?: string }> =
      [];
    const fakeClerkClient = {
      users: {
        getUserList: async ({ emailAddress }: { emailAddress?: string[] }) => {
          const email = emailAddress?.[0] ?? "";
          if (email === clientAEmail.toLowerCase()) {
            return {
              data: [
                {
                  id: "user_found_123456",
                  firstName: "Marina",
                  lastName: "Silva",
                  createdAt: 1730000000000,
                  emailAddresses: [
                    { emailAddress: clientAEmail.toLowerCase() },
                  ],
                },
              ],
            };
          }
          return { data: [] };
        },
      },
      invitations: {
        createInvitation: async (params: {
          emailAddress: string;
          redirectUrl?: string;
        }) => {
          invitedCalls.push(params);
          return { id: "inv_test_999" };
        },
      },
    };

    const lookupReq = new Request(
      `${SITE_ORIGIN}/admin/api/clientes/clerk-lookup?email=${encodeURIComponent(clientAEmail.toUpperCase())}`,
      { headers: { Cookie: adminCookie } },
    );
    const lookupRes = await handleClientAdminApi(
      lookupReq,
      new URL(lookupReq.url),
      clerkEnv,
      { clerkClient: fakeClerkClient },
    );
    expect(lookupRes?.status).toBe(200);
    const lookupBody = (await lookupRes?.json()) as {
      matches: Array<{ clerkUserId: string; email: string; fullName: string }>;
    };
    expect(lookupBody.matches).toEqual([
      {
        clerkUserId: "user_found_123456",
        email: clientAEmail.toLowerCase(),
        fullName: "Marina Silva",
        createdAt: expect.any(String),
      },
    ]);

    const inviteResExisting = await handleClientAdminApi(
      new Request(`${SITE_ORIGIN}/admin/api/clientes/${clientAId}/clerk-invite`, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: SITE_ORIGIN },
      }),
      new URL(`${SITE_ORIGIN}/admin/api/clientes/${clientAId}/clerk-invite`),
      clerkEnv,
      { clerkClient: fakeClerkClient },
    );
    expect(inviteResExisting?.status).toBe(200);
    expect(await inviteResExisting?.json()).toMatchObject({
      status: "already_registered",
      user: {
        clerkUserId: "user_found_123456",
        email: clientAEmail.toLowerCase(),
      },
    });
    expect(invitedCalls).toHaveLength(0);

    const inviteUrl = `${SITE_ORIGIN}/admin/api/clientes/${clientBId}/clerk-invite`;
    const inviteResNew = await handleClientAdminApi(
      new Request(inviteUrl, {
        method: "POST",
        headers: { Cookie: adminCookie, Origin: SITE_ORIGIN },
      }),
      new URL(inviteUrl),
      clerkEnv,
      { clerkClient: fakeClerkClient },
    );
    expect(inviteResNew?.status).toBe(200);
    expect(await inviteResNew?.json()).toEqual({
      status: "invited",
      invitationId: "inv_test_999",
    });
    expect(invitedCalls).toHaveLength(1);
    expect(invitedCalls[0].redirectUrl).toBe(`${SITE_ORIGIN}/albuns/entrar`);

    // Must never auto-link clientB in D1
    expect(
      await env.DB.prepare(
        "SELECT clerk_user_id FROM clerk_pilot_identity_links WHERE client_id = ?",
      )
        .bind(clientBId)
        .first(),
    ).toBeNull();

    const audit = await env.DB.prepare(
      "SELECT action FROM audit_log WHERE entity_id = ? AND action = 'client.clerk_invited'",
    )
      .bind(clientBId)
      .first();
    expect(audit).toEqual({ action: "client.clerk_invited" });
  });

  it("allows owner reassignment strictly on drafts via PUT /owner and keeps PATCH free of clientId", async () => {
    const draftGalleryId = await seedGallery(clientAId, "draft");

    const patchRejected = await dispatch(
      clerkEnv,
      `/admin/api/albuns-privados/${draftGalleryId}`,
      {
        method: "PATCH",
        headers: { Cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientBId }),
      },
    );
    expect(patchRejected.status).toBe(400);

    const transferRes = await dispatch(
      clerkEnv,
      `/admin/api/albuns-privados/${draftGalleryId}/owner`,
      {
        method: "PUT",
        headers: { Cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientBId }),
      },
    );
    expect(transferRes.status).toBe(200);
    const transferred = (await transferRes.json()) as {
      gallery: { clientId: string };
    };
    expect(transferred.gallery.clientId).toBe(clientBId);

    const ownerAudit = await env.DB.prepare(
      "SELECT action, data_json FROM audit_log WHERE entity_id = ? AND action = 'client_gallery.owner_changed'",
    )
      .bind(draftGalleryId)
      .first<{ action: string; data_json: string }>();
    expect(ownerAudit?.action).toBe("client_gallery.owner_changed");
    expect(JSON.parse(ownerAudit!.data_json)).toEqual({
      previousClientId: clientAId,
      nextClientId: clientBId,
    });

    const publishedGalleryId = await seedGallery(clientAId, "published");
    const blockedRes = await dispatch(
      clerkEnv,
      `/admin/api/albuns-privados/${publishedGalleryId}/owner`,
      {
        method: "PUT",
        headers: { Cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientBId }),
      },
    );
    expect(blockedRes.status).toBe(409);

    const row = await env.DB.prepare(
      "SELECT client_id FROM client_galleries WHERE id = ?",
    )
      .bind(publishedGalleryId)
      .first<{ client_id: string }>();
    expect(row?.client_id).toBe(clientAId);

    const noopOwnerRes = await dispatch(
      clerkEnv,
      `/admin/api/albuns-privados/${publishedGalleryId}/owner`,
      {
        method: "PUT",
        headers: { Cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientAId }),
      },
    );
    expect(noopOwnerRes.status).toBe(200);
  });

  it("exposes readyImageCount and favoriteCount accurately in admin and client gallery summaries", async () => {
    const galleryId = await seedGallery(clientAId, "published");
    const ready1 = await seedReadyImage(galleryId);
    const ready2 = await seedReadyImage(galleryId);
    const pendingId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO client_gallery_images (id, gallery_id, storage_key, original_filename, mime_type, size_bytes, alt_text, position, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending.jpg', 'image/jpeg', 1, '', 2, 'pending', datetime('now'), datetime('now'))`,
    )
      .bind(pendingId, galleryId, `client-galleries/${galleryId}/${pendingId}.jpg`)
      .run();

    const favRes = await dispatch(
      clerkEnv,
      `/api/client/galleries/${galleryId}/favorites/${ready1}`,
      { method: "PUT", headers: { Cookie: clientACookie } },
    );
    expect(favRes.status).toBe(200);

    const clientListRes = await dispatch(clerkEnv, "/api/client/galleries", {
      headers: { Cookie: clientACookie },
    });
    expect(clientListRes.status).toBe(200);
    const clientList = (await clientListRes.json()) as {
      galleries: Array<{ id: string; readyImageCount?: number; favoriteCount?: number }>;
    };
    const foundClient = clientList.galleries.find((g) => g.id === galleryId);
    expect(foundClient?.readyImageCount).toBe(2);
    expect(foundClient?.favoriteCount).toBe(1);

    const adminListRes = await dispatch(clerkEnv, "/admin/api/albuns-privados", {
      headers: { Cookie: adminCookie },
    });
    expect(adminListRes.status).toBe(200);
    const adminList = (await adminListRes.json()) as {
      galleries: Array<{ id: string; readyImageCount?: number; favoriteCount?: number }>;
    };
    const foundAdmin = adminList.galleries.find((g) => g.id === galleryId);
    expect(foundAdmin?.readyImageCount).toBe(2);
    expect(foundAdmin?.favoriteCount).toBe(1);
    expect(ready2).toBeTruthy();
  });
});
