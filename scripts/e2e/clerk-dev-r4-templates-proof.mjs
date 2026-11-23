/**
 * Real Chromium end-to-end proof of Punctum R4 private albums + 5 clickable templates
 * against Clerk DEVELOPMENT (never Clerk Production) and the compiled Hostinger candidate server
 * with an isolated temporary SQLite database and private originals directory.
 *
 * Security & operational guards:
 * - Explicitly refuses Clerk Production keys (`sk_live_`, `pk_live_`) or `punctumpicture.com` issuer.
 * - Never prints or writes secret keys, JWTs, cookies, or personal e-mail addresses.
 * - Revokes every synthetic Clerk Development test session and sign-in token in `finally`.
 * - Clearly marks scope as local isolated candidate + Clerk Development (does NOT promote remote/prod gates).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, createPublicKey, randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { withProofDatabase } from "../hostinger-clerk-production-proof.mjs";
import { summarizeAxeAudit } from "./accessibility-evidence.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUTPUT_DIR = resolve(process.env.PUNCTUM_CLERK_DEV_PROOF_OUTPUT || "outputs/clerk-dev-proof");
const SCOPE_LIMIT =
  "real-Clerk-Development + isolated-local-Hostinger-candidate-Node + synthetic-SQLite; ticket login (not password/MFA); does NOT prove remote Hostinger TLS/runtime or Clerk Production";

const hashHex = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function parseDevProofInputs(env) {
  const secretKey = (env.CLERK_SECRET_KEY ?? "").trim();
  const publishableKey = (env.CLERK_PUBLISHABLE_KEY ?? "").trim();
  const adminUserId = (env.PUNCTUM_CLERK_DEV_ADMIN_USER_ID ?? "").trim();
  const clientUserId = (env.PUNCTUM_CLERK_DEV_CLIENT_USER_ID ?? "").trim();
  const devOrganizationId = (env.PUNCTUM_CLERK_DEV_ORG_ID ?? "").trim();
  const ephemeralUsers = env.PUNCTUM_CLERK_DEV_EPHEMERAL_USERS === "1";

  assert(secretKey && publishableKey, "PROOF_INPUTS_MISSING");
  assert(!secretKey.startsWith("sk_live_") && !publishableKey.startsWith("pk_live_"), "PROOF_PRODUCTION_KEY_FORBIDDEN");
  assert(/^sk_test_[a-zA-Z0-9_-]+$/.test(secretKey), "PROOF_DEV_SECRET_KEY_INVALID");
  assert(/^pk_test_[a-zA-Z0-9+/]+={0,2}$/.test(publishableKey), "PROOF_DEV_PUBLISHABLE_KEY_INVALID");

  const decodedHost = Buffer.from(publishableKey.slice("pk_test_".length), "base64").toString("utf8");
  assert(decodedHost.endsWith("$"), "PROOF_DEV_PUBLISHABLE_KEY_MALFORMED");
  const hostname = decodedHost.slice(0, -1);
  assert(
    hostname.endsWith(".clerk.accounts.dev") && !hostname.includes("punctumpicture.com"),
    "PROOF_NON_DEV_ISSUER_FORBIDDEN",
  );
  const issuer = `https://${hostname}`;

  if (devOrganizationId) {
    assert(/^org_[a-zA-Z0-9_-]{3,180}$/.test(devOrganizationId), "PROOF_DEV_ORG_ID_INVALID");
  }
  if (!ephemeralUsers) {
    assert(adminUserId && clientUserId, "PROOF_INPUTS_MISSING");
    assert(/^user_[a-zA-Z0-9_-]{3,180}$/.test(adminUserId), "PROOF_ADMIN_USER_ID_INVALID");
    assert(/^user_[a-zA-Z0-9_-]{3,180}$/.test(clientUserId), "PROOF_CLIENT_USER_ID_INVALID");
    assert(adminUserId !== clientUserId, "PROOF_DISTINCT_USERS_REQUIRED");
  }

  return {
    secretKey,
    publishableKey,
    issuer,
    adminUserId: ephemeralUsers ? null : adminUserId,
    clientUserId: ephemeralUsers ? null : clientUserId,
    devOrganizationId: devOrganizationId || null,
    ephemeralUsers,
  };
}

async function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

async function waitForHealth(origin, child) {
  for (let i = 0; i < 60; i++) {
    assert(child.exitCode === null, "PROOF_CANDIDATE_EXITED");
    try {
      const res = await fetch(origin + "/api/health", { redirect: "error", signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      /* server starting */
    }
    await delay(300);
  }
  throw new Error("PROOF_CANDIDATE_HEALTH_TIMEOUT");
}

async function stopServer(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}

async function makeSyntheticPng(label, bg = "#2d2526", accent = "#e8dfd5") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
    <rect width="100%" height="100%" fill="${bg}"/>
    <rect x="64" y="48" width="772" height="504" fill="none" stroke="${accent}" stroke-width="6"/>
    <text x="50%" y="52%" text-anchor="middle" font-family="Georgia,serif" font-size="44" fill="${accent}">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function verifyDevBrowserJwt(jwt, jwks, issuer, expectedUserId, expectedSessionId, expectedOrigin) {
  const { decodeProtectedHeader, jwtVerify } = await import("jose");
  const header = decodeProtectedHeader(jwt);
  assert(header.alg === "RS256" && typeof header.kid === "string", "PROOF_JWT_HEADER_INVALID");
  const matches = jwks.keys.filter(
    (k) => k.kid === header.kid && k.kty === "RSA" && !k.d && (!k.use || k.use === "sig") && (!k.alg || k.alg === "RS256"),
  );
  assert.equal(matches.length, 1, "PROOF_JWKS_KEY_MATCH_FAILED");
  const key = createPublicKey({ key: matches[0], format: "jwk" });
  const { payload } = await jwtVerify(jwt, key, {
    issuer,
    subject: expectedUserId,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "sub", "sid", "azp"],
  });
  assert.equal(payload.sid, expectedSessionId, "PROOF_JWT_SID_MISMATCH");
  assert.equal(payload.azp, expectedOrigin, "PROOF_JWT_AZP_MISMATCH");
  assert(!payload.act, "PROOF_JWT_UNEXPECTED_ACTOR");
}

async function clerkSignInWithTicket(page, bapi, userId, organizationId, owned) {
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.client?.signIn), { timeout: 30_000 });
  const ticket = await bapi("/sign_in_tokens", { user_id: userId, expires_in_seconds: 120, honor_lockout: true });
  assert(/^sit_[a-zA-Z0-9_-]+$/.test(ticket.id) && typeof ticket.token === "string");
  owned.tickets.push(ticket.id);
  const result = await page.evaluate(async ({ token, expectedUserId, orgId }) => {
    const clerk = window.Clerk;
    const signIn = await clerk.client.signIn.create({ strategy: "ticket", ticket: token });
    if (signIn.status !== "complete" || !signIn.createdSessionId) return { ok: false, sessionId: null };
    await clerk.setActive({
      session: signIn.createdSessionId,
      ...(orgId ? { organization: orgId } : {}),
      navigate: async () => {},
    });
    const jwt = await clerk.session.getToken({ skipCache: true });
    return {
      ok: clerk.user?.id === expectedUserId && clerk.session?.id === signIn.createdSessionId && typeof jwt === "string",
      sessionId: signIn.createdSessionId,
      sessionStatus: clerk.session?.status ?? null,
      currentTask: clerk.session?.currentTask?.key ?? null,
      jwt,
    };
  }, { token: ticket.token, expectedUserId: userId, orgId: organizationId });
  if (result.sessionId) owned.sessions.push({ sessionId: result.sessionId, userId });
  assert(result.ok && result.sessionId && result.jwt, "PROOF_CLERK_SDK_TICKET_SIGNIN_FAILED");
  return { sessionId: result.sessionId, sessionStatus: result.sessionStatus, currentTask: result.currentTask, jwt: result.jwt };
}

async function cleanupOwnedClerkArtifacts(bapi, owned) {
  let failed = false;
  const revokedSessions = new Set();
  for (const item of owned.sessions) {
    if (revokedSessions.has(item.sessionId)) continue;
    revokedSessions.add(item.sessionId);
    try {
      const current = await bapi("/sessions/" + item.sessionId);
      if (current.user_id === item.userId && !current.actor && current.status === "active") {
        await bapi("/sessions/" + item.sessionId + "/revoke", {});
      }
      const after = await bapi("/sessions/" + item.sessionId);
      assert(after.status !== "active");
    } catch {
      failed = true;
    }
  }
  for (const ticketId of owned.tickets) {
    try {
      const revoked = await bapi("/sign_in_tokens/" + ticketId + "/revoke", {});
      assert(revoked.status === "revoked" || revoked.status === "accepted");
    } catch {
      // Accepted one-time tickets return 400 on revoke; expected when consumed into a session.
    }
  }
  for (const userId of owned.ephemeralUsers ?? []) {
    try {
      const deleted = await bapi("/users/" + userId, undefined, "DELETE");
      assert(deleted.deleted === true);
    } catch {
      failed = true;
    }
  }
  assert(!failed, "PROOF_CLERK_CLEANUP_FAILED");
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const report = {
    status: "running",
    startedUtc: new Date().toISOString(),
    scope: SCOPE_LIMIT,
    issuer: null,
    checks: {},
    http: {},
    accessibilityAudits: [],
    pageErrors: [],
    consoleErrors: [],
    loopbackNotes: [],
    serverErrors: [],
  };

  let stage = "inputs";
  try {
    const input = parseDevProofInputs(process.env);
    report.issuer = input.issuer;
    assert(existsSync(join(ROOT, "dist/hostinger-candidate/server/index.js")), "PROOF_CANDIDATE_BUILD_MISSING");
    const { chromium } = await import("playwright");

    const bapi = async (path, body, methodOverride) => {
      const method = methodOverride ?? (body === undefined ? "GET" : "POST");
      const res = await fetch("https://api.clerk.com/v1" + path, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: "Bearer " + input.secretKey,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!res.ok) throw new Error(`PROOF_BAPI_HTTP_${res.status}`);
      return res.json();
    };

    stage = "jwks";
    const jwksRes = await fetch(input.issuer + "/.well-known/jwks.json", {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    assert(jwksRes.ok, "PROOF_JWKS_FETCH_FAILED");
    const jwks = await jwksRes.json();
    const rsaKey = jwks.keys.find(
      (k) => k.kty === "RSA" && !k.d && (!k.use || k.use === "sig") && (!k.alg || k.alg === "RS256"),
    );
    assert(rsaKey, "PROOF_JWKS_NO_RSA_KEY");
    const pem = createPublicKey({ key: rsaKey, format: "jwk" }).export({ type: "spki", format: "pem" }).toString();
    report.checks.devJwksLoaded = true;

    const photoA = await makeSyntheticPng("Clerk-Dev-Album-A", "#2a2325", "#efe6dc");
    const photoB = await makeSyntheticPng("Clerk-Dev-Album-B", "#1d262b", "#d0dce2");
    const photoASha = hashHex(photoA);
    const photoBSha = hashHex(photoB);

    await withProofDatabase(async (db, { dbFile, directory }) => {
      for (const dir of ["originals", "backups"]) mkdirSync(join(directory, dir), { mode: 0o700 });
      const port = await freePort();
      const origin = `http://127.0.0.1:${port}`;
      const adminEmail = "maria-clerk-dev-qa@example.test";
      const owned = { sessions: [], tickets: [], ephemeralUsers: [] };
      let child;
      let browser;

      const attachListeners = (page, allowExpectedRef = { current: false }) => {
        page.on("pageerror", (e) => report.pageErrors.push(e.message));
        page.on("console", (m) => {
          if (m.type() !== "error") return;
          const text = m.text();
          if (text.includes("https://punctumpicture.com/favicon")) {
            report.loopbackNotes.push(text);
            return;
          }
          if (allowExpectedRef.current && /status of (401|403|404)\b/.test(text)) {
            return;
          }
          report.consoleErrors.push(text);
        });
        page.on("response", (r) => {
          if (r.status() >= 500) report.serverErrors.push(`${r.status()} ${new URL(r.url()).pathname}`);
        });
      };

      try {
        let adminUserId = input.adminUserId;
        let clientUserId = input.clientUserId;
        if (input.ephemeralUsers) {
          stage = "ephemeral-dev-users";
          const suffix = randomBytes(6).toString("hex");
          const createSyntheticDevUser = async (roleLabel) => {
            const created = await bapi("/users", {
              email_address: [`punctum-r4-${roleLabel}-${suffix}+clerk_test@example.com`],
              first_name: "Punctum",
              last_name: `QA ${roleLabel}`,
              password: `PunctumDevQA-${randomBytes(12).toString("hex")}!`,
              skip_password_checks: true,
            });
            assert(/^user_[a-zA-Z0-9_-]+$/.test(created.id));
            owned.ephemeralUsers.push(created.id);
            if (input.devOrganizationId) {
              await bapi(`/organizations/${input.devOrganizationId}/memberships`, {
                user_id: created.id,
                role: "org:member",
              });
            }
            return created.id;
          };
          adminUserId = await createSyntheticDevUser("admin");
          clientUserId = await createSyntheticDevUser("client");
          report.checks.ephemeralSyntheticDevUsersCreated = true;
        }
        assert(adminUserId && clientUserId);
        stage = "candidate-server-start";
        child = spawn(process.execPath, [join(ROOT, "services/punctum-hostinger-production/candidate-server.mjs")], {
          cwd: ROOT,
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            TMPDIR: directory,
            NODE_ENV: "production",
            PUNCTUM_PRODUCTION_CANDIDATE_MODE: "private-candidate",
            PUNCTUM_CANDIDATE_ENVIRONMENT: "staging",
            PUNCTUM_CANDIDATE_ORIGIN: origin,
            PUNCTUM_CANDIDATE_PUBLIC_URL: origin,
            PUNCTUM_CANDIDATE_DB_FILE: dbFile,
            PUNCTUM_CANDIDATE_ORIGINALS: join(directory, "originals"),
            PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(directory, "backups"),
            PUNCTUM_CANDIDATE_ADMIN_EMAIL: adminEmail,
            PUNCTUM_CANDIDATE_ADMIN_PASSWORD_HASH: hashHex(randomBytes(24)),
            PUNCTUM_CANDIDATE_ADMIN_SESSION_SECRET: randomBytes(48).toString("hex"),
            PUNCTUM_CANDIDATE_CLIENT_SESSION_SECRET: randomBytes(48).toString("hex"),
            PUNCTUM_CANDIDATE_ADMIN_AUTH_MODE: "clerk",
            PUNCTUM_CANDIDATE_CLIENT_AUTH_MODE: "clerk",
            PUNCTUM_CANDIDATE_CLERK_AUTH_ENABLED: "true",
            PUNCTUM_CANDIDATE_PRIVATE_GALLERIES_ENABLED: "true",
            CLERK_ISSUER: input.issuer,
            CLERK_PUBLISHABLE_KEY: input.publishableKey,
            CLERK_JWT_KEY: pem,
            CLERK_SECRET_KEY: input.secretKey,
            CLERK_AUTHORIZED_PARTIES: origin,
          },
          stdio: ["ignore", "ignore", "pipe"],
        });
        await waitForHealth(origin, child);
        report.checks.candidateServerStartedWithRealClerkDev = true;

        browser = await chromium.launch({ headless: true });

        // ============================================================
        // 1. REAL CLERK DEV ADMIN BROWSER FLOW (/acesso -> /admin)
        // ============================================================
        stage = "admin-clerk-browser-signin";
        const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const adminPage = await adminCtx.newPage();
        const adminExpectedErr = { current: false };
        attachListeners(adminPage, adminExpectedErr);

        const acessoRes = await adminPage.goto(origin + "/acesso", { waitUntil: "domcontentloaded" });
        report.http.acesso = acessoRes?.status();
        assert.equal(acessoRes?.status(), 200);

        const { sessionId: adminSid, sessionStatus: adminStatus, currentTask: adminTask, jwt: adminJwt } = await clerkSignInWithTicket(
          adminPage,
          bapi,
          adminUserId,
          input.devOrganizationId,
          owned,
        );
        await verifyDevBrowserJwt(adminJwt, jwks, input.issuer, adminUserId, adminSid, origin);
        report.checks.adminRealClerkDevJwtWithLocalAzp = true;
        report.checks.adminSessionStatus = adminStatus;
        report.checks.adminCurrentTask = adminTask;

        // Unlinked admin must be denied 403 via real UI click
        stage = "admin-unlinked-button-visible";
        const openAdminBtn = adminPage.getByRole("button", { name: /Abrir painel administrativo/i });
        try {
          await openAdminBtn.waitFor({ state: "visible", timeout: 10_000 });
        } catch (err) {
          await adminPage.reload({ waitUntil: "domcontentloaded" });
          await adminPage.waitForFunction(() => Boolean(window.Clerk?.loaded), { timeout: 10_000 });
          const btnsAfterReload = await adminPage.locator("button").allInnerTexts().catch(() => []);
          throw new Error(`admin-btn-missing status=${adminStatus} task=${adminTask} afterReload=${JSON.stringify(btnsAfterReload)} err=${err.message}`);
        }
        stage = "admin-unlinked-denied";
        adminExpectedErr.current = true;
        const unlinkedRespPromise = adminPage.waitForResponse(
          (r) => r.url().endsWith("/admin/api/clerk-session") && r.request().method() === "POST",
          { timeout: 15_000 },
        );
        await openAdminBtn.click();
        const unlinkedResp = await unlinkedRespPromise;
        report.http.adminUnlinkedExchange = unlinkedResp.status();
        assert.equal(unlinkedResp.status(), 403);
        await adminPage.locator('.access-status[role="alert"]').waitFor({ state: "visible" });
        adminExpectedErr.current = false;
        assert.equal(await db.prepare("SELECT count(*) AS n FROM clerk_admin_identity_links").first("n"), 0);
        report.checks.adminUnlinkedDenied403 = true;

        // Bind admin in local isolated SQLite, then exchange via real UI button click
        stage = "admin-linked-exchange";
        const now = new Date().toISOString();
        await db
          .prepare(
            `INSERT INTO clerk_admin_identity_links
             (clerk_user_id, admin_principal_id, role, session_version, created_at, updated_at)
             VALUES (?, ?, 'admin', 1, ?, ?)`,
          )
          .bind(adminUserId, adminEmail, now, now)
          .run();

        const [linkedResp] = await Promise.all([
          adminPage.waitForResponse((r) => r.url().endsWith("/admin/api/clerk-session") && r.request().method() === "POST"),
          adminPage.getByRole("button", { name: /Abrir painel administrativo/i }).click(),
        ]);
        report.http.adminLinkedExchange = linkedResp.status();
        assert.equal(linkedResp.status(), 200);
        await adminPage.waitForURL(/\/admin$/);
        report.checks.adminRealUiClerkExchange200 = true;

        // Maria registers Client A and Client B and links Client A to Clerk Dev user via UI
        stage = "admin-ui-client-and-clerk-link";
        await adminPage.goto(origin + "/admin/clientes");
        await adminPage.getByRole("heading", { name: "Clientes" }).waitFor();
        await adminPage.getByLabel("Nome", { exact: true }).fill("Cliente A Clerk Dev QA");
        await adminPage.getByLabel("E-mail", { exact: true }).fill("cliente-a-clerk-dev@example.test");
        await Promise.all([
          adminPage.waitForResponse((r) => r.url().endsWith("/admin/api/clientes") && r.request().method() === "POST"),
          adminPage.getByRole("button", { name: "Cadastrar cliente", exact: true }).click(),
        ]);
        await adminPage.getByText("Cliente A Clerk Dev QA").waitFor();

        // Bind Client A to real Clerk Dev user via Maria's UI
        const clientACard = adminPage.locator("article.pga-client", { hasText: "Cliente A Clerk Dev QA" });
        await clientACard.getByLabel(/ID Clerk/i).fill(clientUserId);
        await Promise.all([
          adminPage.waitForResponse((r) => r.url().endsWith("/clerk-link") && r.request().method() === "PUT"),
          clientACard.getByRole("button", { name: "Vincular Clerk", exact: true }).click(),
        ]);
        await clientACard.getByText("Clerk vinculado", { exact: true }).waitFor();

        // Register Client B
        await adminPage.getByLabel("Nome", { exact: true }).fill("Cliente B Isolamento QA");
        await adminPage.getByLabel("E-mail", { exact: true }).fill("cliente-b-clerk-dev@example.test");
        await Promise.all([
          adminPage.waitForResponse((r) => r.url().endsWith("/admin/api/clientes") && r.request().method() === "POST"),
          adminPage.getByRole("button", { name: "Cadastrar cliente", exact: true }).click(),
        ]);
        await adminPage.getByText("Cliente B Isolamento QA").waitFor();

        // WCAG 2.1 AA audit on /admin/clientes with Clerk link controls active
        await adminPage.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
        const adminClientsAxe = summarizeAxeAudit(
          await adminPage.evaluate(() =>
            window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }),
          ),
        );
        report.accessibilityAudits.push({ label: "admin-clientes-clerk-ui", ...adminClientsAxe });
        assert.deepEqual(adminClientsAxe.violations, [], "WCAG violation on /admin/clientes Clerk UI");
        report.checks.adminUiClerkClientLinkAndAxePass = true;

        // Create Album A (template: editorial) via UI picker, then upload & publish A and B
        stage = "admin-create-albums-and-templates";
        const clientARow = await db
          .prepare("SELECT id FROM client_accounts WHERE email=?")
          .bind("cliente-a-clerk-dev@example.test")
          .first();
        const clientBRow = await db
          .prepare("SELECT id FROM client_accounts WHERE email=?")
          .bind("cliente-b-clerk-dev@example.test")
          .first();
        assert(clientARow?.id && clientBRow?.id);

        await adminPage.goto(origin + "/admin/albuns-privados");
        await adminPage.locator(".pga-template-card").first().waitFor();
        await adminPage.getByRole("button", { name: /Editorial/i }).click();
        await adminPage.getByLabel("Título", { exact: true }).fill("Álbum A Editorial Clerk Dev");
        await adminPage.locator(`select option[value="${clientARow.id}"]`).waitFor({ state: "attached" });
        await adminPage.getByRole("combobox", { name: /^Cliente/ }).selectOption(clientARow.id);
        await adminPage.getByRole("button", { name: "Criar rascunho", exact: true }).click();
        await adminPage.waitForURL(/\/admin\/albuns-privados\/[a-f0-9-]+$/);
        const galleryA = new URL(adminPage.url()).pathname.split("/").at(-1);

        const adminCookieHeader = (await adminCtx.cookies(origin + "/admin"))
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        const adminFetch = (path, method = "GET", body) =>
          fetch(origin + path, {
            method,
            headers: {
              Cookie: adminCookieHeader,
              ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
              ...(method !== "GET" ? { Origin: origin } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
          });

        async function uploadAndPublish(galleryId, filename, bytes, sha) {
          const intentRes = await adminFetch(`/admin/api/albuns-privados/${galleryId}/uploads/intents`, "POST", {
            filename,
            mimeType: "image/png",
            sizeBytes: bytes.length,
            sha256: sha,
            altText: filename,
          });
          assert.equal(intentRes.status, 201);
          const intent = await intentRes.json();
          const putRes = await fetch(new URL(intent.uploadUrl, origin), {
            method: "PUT",
            headers: { Cookie: adminCookieHeader, Origin: origin, ...intent.requiredHeaders },
            body: bytes,
          });
          assert(putRes.status === 200 || putRes.status === 201);
          assert.equal((await adminFetch(`/admin/api/albuns-privados/${galleryId}/uploads/${intent.intentId}/complete`, "POST")).status, 200);
          assert.equal((await adminFetch(`/admin/api/albuns-privados/${galleryId}/cover`, "PUT", { imageId: intent.imageId })).status, 200);
          assert.equal((await adminFetch(`/admin/api/albuns-privados/${galleryId}`, "PATCH", { allowDownloads: true })).status, 200);
          assert.equal((await adminFetch(`/admin/api/albuns-privados/${galleryId}/publish`, "POST")).status, 200);
          return intent.imageId;
        }

        await uploadAndPublish(galleryA, "clerk-a-01.png", photoA, photoASha);

        const galleryBRes = await adminFetch("/admin/api/albuns-privados", "POST", {
          clientId: clientBRow.id,
          title: "Álbum B Privado Isolado",
          introduction: "Exclusivo do Cliente B.",
          theme: "noir",
          layoutPreset: "classico",
          allowDownloads: true,
        });
        assert.equal(galleryBRes.status, 201);
        const galleryB = (await galleryBRes.json()).gallery.id;
        await uploadAndPublish(galleryB, "clerk-b-01.png", photoB, photoBSha);
        report.checks.albumsCreatedAndPublishedByClerkAdmin = true;

        // ============================================================
        // 2. REAL CLERK DEV CLIENT BROWSER FLOW (/albuns/entrar -> /albuns)
        // ============================================================
        stage = "client-clerk-browser-signin";
        const clientCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const clientPage = await clientCtx.newPage();
        const clientExpectedErr = { current: false };
        attachListeners(clientPage, clientExpectedErr);

        const entrarRes = await clientPage.goto(origin + "/albuns/entrar", { waitUntil: "domcontentloaded" });
        report.http.albunsEntrar = entrarRes?.status();
        assert.equal(entrarRes?.status(), 200);
        // Clerk-only mode must hide the legacy password form
        assert.equal(await clientPage.locator('input[type="password"]').count(), 0);

        const { sessionId: clientSid, sessionStatus: clientStatus, currentTask: clientTask, jwt: clientJwt } = await clerkSignInWithTicket(
          clientPage,
          bapi,
          clientUserId,
          input.devOrganizationId,
          owned,
        );
        await verifyDevBrowserJwt(clientJwt, jwks, input.issuer, clientUserId, clientSid, origin);
        report.checks.clientRealClerkDevJwtWithLocalAzp = true;
        report.checks.clientSessionStatus = clientStatus;
        report.checks.clientCurrentTask = clientTask;

        // Exchange via real UI button click on /albuns/entrar
        stage = "client-clerk-button-visible";
        const openAlbumsBtn = clientPage.getByRole("button", { name: /Abrir meus álbuns/i });
        await openAlbumsBtn.waitFor({ state: "visible", timeout: 15_000 });
        stage = "client-clerk-ui-exchange";
        const clientExchangePromise = clientPage.waitForResponse(
          (r) => r.url().endsWith("/api/client/clerk-session") && r.request().method() === "POST",
          { timeout: 15_000 },
        );
        await openAlbumsBtn.click();
        const clientExchangeResp = await clientExchangePromise;
        report.http.clientClerkExchange = clientExchangeResp.status();
        assert.equal(clientExchangeResp.status(), 200);
        await clientPage.waitForURL(/\/albuns$/);
        await clientPage.getByText("Álbum A Editorial Clerk Dev").waitFor();
        assert.equal(await clientPage.getByText("Álbum B Privado Isolado").count(), 0, "Client B album leaked to Client A");
        // Verify ClientHeader loaded /api/client/me with authMode: "clerk" cleanly (no "Senha" link)
        assert.equal(await clientPage.getByRole("link", { name: "Senha", exact: true }).count(), 0);
        report.checks.clientRealUiClerkExchangeAndIsolation = true;

        // Open Album A and verify persisted editorial template, image decode, favorite, download SHA-256
        stage = "client-album-editorial-and-interactions";
        await clientPage.getByText("Álbum A Editorial Clerk Dev").click();
        await clientPage.waitForURL(new RegExp(`/albuns/${galleryA}$`));
        await clientPage.locator(".pa-photo img").first().waitFor();
        assert.equal(await clientPage.locator(".pa-themed").getAttribute("data-layout-preset"), "editorial");

        const decoded = await clientPage.evaluate(async () => {
          const img = document.querySelector(".pa-photo img");
          if (!img) return false;
          if (!img.complete) {
            await new Promise((res) => { img.onload = res; img.onerror = res; setTimeout(res, 5000); });
          }
          return img.naturalWidth > 0 && (img.getAttribute("src") || "").startsWith("/api/client/galleries/");
        });
        assert.equal(decoded, true);

        // Favorite toggle & persistence
        const favBtn = clientPage.locator(".pa-photo figcaption button").first();
        await Promise.all([
          clientPage.waitForResponse((r) => r.url().includes("/favorites/") && r.request().method() === "PUT"),
          favBtn.click(),
        ]);
        await clientPage.locator('.pa-photo figcaption button[aria-pressed="true"]').first().waitFor();

        // Authorized original download SHA-256
        const dlHref = await clientPage.locator(".pa-photo figcaption a[download]").first().getAttribute("href");
        const dlRes = await clientCtx.request.get(origin + dlHref);
        assert.equal(dlRes.status(), 200);
        assert.equal(hashHex(await dlRes.body()), photoASha);

        // Security checks from Client A's authenticated browser context:
        // 1) Cannot read Client B's album (404)
        const crossRead = await clientCtx.request.get(origin + "/api/client/galleries/" + galleryB);
        report.http.clientACrossReadClientB = crossRead.status();
        assert.equal(crossRead.status(), 404);
        // 2) Cannot mutate template via admin PATCH (403)
        const clientMutate = await clientCtx.request.patch(origin + "/admin/api/albuns-privados/" + galleryA, {
          headers: { Origin: origin, "Content-Type": "application/json" },
          data: { layoutPreset: "cinema" },
        });
        report.http.clientATemplateMutationAttempt = clientMutate.status();
        assert.equal(clientMutate.status(), 403);
        report.checks.clientFavoriteDownloadAndSecurityDenials = true;

        // Admin updates template from editorial -> cinema; Clerk link untouched; Client A sees cinema on reload
        stage = "admin-template-update-reflected-to-clerk-client";
        const linkBefore = await db
          .prepare("SELECT clerk_user_id, client_id, session_version_at_link FROM clerk_pilot_identity_links WHERE client_id=?")
          .bind(clientARow.id)
          .first();
        assert.equal((await adminFetch(`/admin/api/albuns-privados/${galleryA}`, "PATCH", { layoutPreset: "cinema" })).status, 200);
        const linkAfter = await db
          .prepare("SELECT clerk_user_id, client_id, session_version_at_link FROM clerk_pilot_identity_links WHERE client_id=?")
          .bind(clientARow.id)
          .first();
        assert.deepEqual(linkAfter, linkBefore);
        await clientPage.reload();
        await clientPage.locator(".pa-photo img").first().waitFor();
        assert.equal(await clientPage.locator(".pa-themed").getAttribute("data-layout-preset"), "cinema");
        assert.equal(await clientPage.locator('.pa-photo figcaption button[aria-pressed="true"]').count(), 1);
        report.checks.templateUpdatePreservesClerkLinkAndFavorite = true;

        // ============================================================
        // 3. LOGOUT & REAL CLERK JWT REPLAY DENIAL (ADMIN + CLIENT)
        // ============================================================
        stage = "client-logout-and-replay-denied";
        clientExpectedErr.current = true;
        await Promise.all([
          clientPage.waitForResponse((r) => r.url().endsWith("/api/client/session") && r.request().method() === "DELETE"),
          clientPage.getByRole("button", { name: "Sair", exact: true }).click(),
        ]);
        await clientPage.waitForURL(/\/albuns\/entrar/);
        const clientReplay = await fetch(origin + "/api/client/clerk-session", {
          method: "POST",
          headers: { Origin: origin, Authorization: "Bearer " + clientJwt },
        });
        report.http.clientJwtReplayAfterLogout = clientReplay.status;
        assert(clientReplay.status === 401 || clientReplay.status === 403, `Expected 401/403, got ${clientReplay.status}`);
        clientExpectedErr.current = false;
        report.checks.clientLogoutAndJwtReplayDenied = true;

        stage = "admin-logout-and-replay-denied";
        const adminLogout = await adminFetch("/admin/api/session", "DELETE");
        report.http.adminLogout = adminLogout.status;
        assert.equal(adminLogout.status, 200);
        const adminReplay = await fetch(origin + "/admin/api/clerk-session", {
          method: "POST",
          headers: { Origin: origin, Authorization: "Bearer " + adminJwt },
        });
        report.http.adminJwtReplayAfterLogout = adminReplay.status;
        assert.equal(adminReplay.status, 403);
        report.checks.adminLogoutAndJwtReplayDenied = true;

        await clientCtx.close();
        await adminCtx.close();

        assert.deepEqual(report.pageErrors, [], "Page errors: " + JSON.stringify(report.pageErrors));
        assert.deepEqual(report.consoleErrors, [], "Console errors: " + JSON.stringify(report.consoleErrors));
        assert.deepEqual(report.serverErrors, [], "Server 5xx errors: " + JSON.stringify(report.serverErrors));
        report.status = "PASS_LOCAL_CLERK_DEVELOPMENT_BROWSER_PROOF";
      } finally {
        await browser?.close();
        await cleanupOwnedClerkArtifacts(bapi, owned);
        report.checks.clerkDevTestSessionsRevoked = true;
        await stopServer(child);
      }
    });
    report.checks.isolatedTempFilesRemoved = true;
  } catch (error) {
    report.status = "FAILED";
    report.failedStage = stage;
    report.errorCode = /^PROOF_[A-Z0-9_]+$/.test(error?.message ?? "") ? error.message : "PROOF_FAILED";
    report.errorDetail = error instanceof Error ? error.message.slice(0, 200) : "unknown";
    process.exitCode = 1;
  } finally {
    report.completedUtc = new Date().toISOString();
    await writeFile(join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ status: report.status, issuer: report.issuer, checks: report.checks, http: report.http }));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
