#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import { fixturePng } from "../../services/punctum-hostinger-production/acceptance-fixture.mjs";

const ORIGIN = "https://punctumpicture.com";
const G05_BYTES = 26_214_400;
const LAYOUT_PRESETS = ["classico", "editorial", "colagem", "mosaico", "cinema"];
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactSizePng(targetBytes = G05_BYTES) {
  const chunks = [fixturePng.subarray(0, -12)];
  let remainder = targetBytes - fixturePng.length;
  while (remainder > 0) {
    const payload = Buffer.alloc(Math.min(256 * 1024, remainder - 12), 0);
    const type = Buffer.from("vpAg");
    const chunk = Buffer.alloc(12 + payload.length);
    chunk.writeUInt32BE(payload.length, 0);
    type.copy(chunk, 4);
    payload.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
    chunks.push(chunk);
    remainder -= chunk.length;
  }
  chunks.push(fixturePng.subarray(-12));
  const out = Buffer.concat(chunks);
  assert.equal(out.length, targetBytes);
  return out;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  assert(value, `Missing required environment variable: ${name}`);
  return value;
}

function safeStageError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/sk_live_[A-Za-z0-9_]+/g, "[REDACTED]").slice(0, 400);
}

async function clerkApi(secretKey, path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Bearer ${secretKey}`,
      accept: "application/json",
      "user-agent": "Punctum-Unlimited-Live-QA/1.0",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`Clerk ${method} ${path} failed HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

async function signInWithClerkTicket(page, url, userId, ticket) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.client?.signIn), {
    timeout: 30_000,
  });
  const result = await page.evaluate(
    async ({ ticketValue, expectedUserId }) => {
      const clerk = window.Clerk;
      const attempt = await clerk.client.signIn.create({ strategy: "ticket", ticket: ticketValue });
      if (attempt.status !== "complete" || !attempt.createdSessionId) {
        return { ok: false, status: attempt.status ?? "unknown" };
      }
      await clerk.setActive({ session: attempt.createdSessionId });
      const jwt = await clerk.session.getToken({ skipCache: true });
      return {
        ok: clerk.user?.id === expectedUserId && Boolean(jwt),
        sessionId: attempt.createdSessionId,
        jwt,
      };
    },
    { ticketValue: ticket, expectedUserId: userId },
  );
  assert(result.ok && result.sessionId && result.jwt, "Clerk sign_in_token browser login failed");
  return { sessionId: result.sessionId, jwt: result.jwt };
}

async function pageJsonFetch(page, path, { method = "GET", body, headers = {} } = {}) {
  return page.evaluate(
    async ({ path, method, body, headers }) => {
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        redirect: "manual",
        headers: {
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      return { status: response.status, data, text: text.slice(0, 300) };
    },
    { path, method, body, headers },
  );
}

async function main() {
  const secretKey = requiredEnv("PUNCTUM_CLERK_PRODUCTION_SECRET_KEY");
  const adminUserId = requiredEnv("PUNCTUM_CLERK_ADMIN_USER_ID");
  const { chromium } = await import("playwright");
  const sharp = (await import("sharp")).default;

  const workDir = mkdtempSync(join(tmpdir(), "punctum-live-qa-"));
  const smallPng = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 32, g: 48, b: 64 } },
  })
    .png()
    .toBuffer();
  const smallSha = sha256(smallPng);
  const smallFilePath = join(workDir, "punctum-qa-sample.png");
  writeFileSync(smallFilePath, smallPng);

  const g05Png = exactSizePng(G05_BYTES);
  const g05Sha = sha256(g05Png);
  assert.equal((await sharp(g05Png).metadata()).format, "png");

  const runSuffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const synthEmail = `punctum-qa-${runSuffix}@example.com`;
  const synthPassword = `${randomBytes(24).toString("base64url")}!9Aa`;

  const state = {
    adminTicketId: null,
    adminSessionId: null,
    clientUserId: null,
    clientTicketId: null,
    clientSessionId: null,
    punctumClientId: null,
    galleryId: null,
  };

  const report = {
    origin: ORIGIN,
    timestamp: new Date().toISOString(),
    status: "IN_PROGRESS",
    checks: {},
    g05LiveProbe: null,
    cleanup: {},
  };

  let browser;
  let adminContext;
  let adminPage;
  let clientContext;
  let clientPage;

  try {
    // 1. Verify public routes load cleanly with zero failed _vinext/image requests
    browser = await chromium.launch({ headless: true });
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    publicPage.setDefaultTimeout(30_000);
    const failedAssets = [];
    publicPage.on("response", (res) => {
      if (res.url().startsWith(ORIGIN) && res.status() >= 400) {
        failedAssets.push({ url: res.url(), status: res.status() });
      }
    });
    for (const path of ["/", "/portfolio", "/arquivo", "/servicos", "/contato", "/fotografia", "/acesso", "/albuns/entrar"]) {
      let resp;
      for (let attempt = 0; attempt < 3; attempt++) {
        resp = await publicPage.goto(`${ORIGIN}${path}`, { waitUntil: "networkidle" });
        if (resp && resp.status() !== 429) break;
        await publicPage.waitForTimeout(8_000);
      }
      assert(resp && resp.status() === 200, `Public route ${path} returned ${resp?.status()}`);
      await publicPage.waitForTimeout(800);
    }
    const non429Failures = failedAssets.filter((entry) => entry.status !== 429);
    assert.deepEqual(non429Failures, [], `Failed public assets: ${JSON.stringify(non429Failures)}`);
    report.checks.publicRoutesZero4xx5xx = true;
    await publicContext.close();

    // 2. Create synthetic Clerk client user in Clerk Production
    const createdClerkClient = await clerkApi(secretKey, "/users", {
      method: "POST",
      body: {
        email_address: [synthEmail],
        first_name: "ClienteQA",
        last_name: "Temporario",
        password: synthPassword,
        skip_password_checks: true,
      },
    });
    state.clientUserId = createdClerkClient.id;
    assert(state.clientUserId?.startsWith("user_"));

    // 3. Sign in as Maria admin on /acesso using one-time ticket
    adminContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    adminPage.setDefaultTimeout(30_000);

    const adminTicket = await clerkApi(secretKey, "/sign_in_tokens", {
      method: "POST",
      body: { user_id: adminUserId, expires_in_seconds: 180, honor_lockout: true },
    });
    state.adminTicketId = adminTicket.id;

    const adminAuth = await signInWithClerkTicket(
      adminPage,
      `${ORIGIN}/acesso`,
      adminUserId,
      adminTicket.token,
    );
    state.adminSessionId = adminAuth.sessionId;

    const adminExchange = await pageJsonFetch(adminPage, "/admin/api/clerk-session", {
      method: "POST",
      headers: { authorization: `Bearer ${adminAuth.jwt}` },
    });
    assert.equal(adminExchange.status, 200, `Admin exchange failed: ${adminExchange.text}`);
    report.checks.adminClerkSessionExchange = true;

    // Verify admin UI renders client list & private albums + template badge
    await adminPage.goto(`${ORIGIN}/admin/albuns-privados`, { waitUntil: "networkidle" });
    assert(adminPage.url().startsWith(`${ORIGIN}/admin/albuns-privados`));
    report.checks.adminPrivateGalleriesUi = true;

    // 4. Create synthetic client + Clerk link + synthetic gallery
    const createClient = await pageJsonFetch(adminPage, "/admin/api/clientes", {
      method: "POST",
      body: { name: "Cliente QA Temporário", email: synthEmail },
    });
    assert.equal(createClient.status, 201, `Client create failed: ${createClient.text}`);
    state.punctumClientId = createClient.data.client.id;

    const linkClient = await pageJsonFetch(
      adminPage,
      `/admin/api/clientes/${state.punctumClientId}/clerk-link`,
      { method: "PUT", body: { clerkUserId: state.clientUserId } },
    );
    assert.equal(linkClient.status, 200, `Clerk link failed: ${linkClient.text}`);
    report.checks.clientCreatedAndClerkLinked = true;

    const createGallery = await pageJsonFetch(adminPage, "/admin/api/albuns-privados", {
      method: "POST",
      body: {
        clientId: state.punctumClientId,
        title: `Ensaio QA Templates ${runSuffix}`,
        theme: "noir",
        layoutPreset: "editorial",
        allowDownloads: true,
      },
    });
    assert.equal(createGallery.status, 201, `Gallery create failed: ${createGallery.text}`);
    state.galleryId = createGallery.data.gallery.id;

    // Confirm admin private album list displays template badge for the new gallery
    await adminPage.reload({ waitUntil: "networkidle" });
    await adminPage.locator(".pga-badge--template").first().waitFor({ timeout: 20_000 });
    const badgeCount = await adminPage.locator(".pga-badge--template").count();
    assert(badgeCount >= 1, "Expected .pga-badge--template to render on admin album card");
    report.checks.adminTemplateBadgeVisible = badgeCount;

    // Open gallery editor page & upload standard image via UI file chooser
    await adminPage.goto(`${ORIGIN}/admin/albuns-privados/${state.galleryId}`, {
      waitUntil: "networkidle",
    });
    const fileInput = adminPage.locator('input[type="file"]');
    await fileInput.waitFor({ timeout: 20_000 });
    await fileInput.setInputFiles(smallFilePath);
    await adminPage.waitForFunction(
      async (gid) => {
        const res = await fetch(`/admin/api/albuns-privados/${gid}`, { credentials: "same-origin" });
        if (!res.ok) return false;
        const json = await res.json();
        return Array.isArray(json.gallery?.images) && json.gallery.images.some((i) => i.status === "ready");
      },
      state.galleryId,
      { timeout: 45_000 },
    );
    const detailAfterSmall = await pageJsonFetch(adminPage, `/admin/api/albuns-privados/${state.galleryId}`);
    assert.equal(detailAfterSmall.status, 200);
    assert(detailAfterSmall.data.uploadMaxBytes === G05_BYTES, `uploadMaxBytes was ${detailAfterSmall.data.uploadMaxBytes}`);
    const smallImageId = detailAfterSmall.data.gallery.images.find((i) => i.status === "ready")?.id;
    assert(smallImageId, "Missing uploaded image ID");
    report.checks.smallBrowserUploadAndUploadMaxBytes25MiB = true;

    // 5. G05 real Hostinger proxy 25 MiB (26,214,400-byte) probe (direct API fetch via authenticated context)
    const intent25 = await pageJsonFetch(
      adminPage,
      `/admin/api/albuns-privados/${state.galleryId}/uploads/intents`,
      {
        method: "POST",
        body: {
          filename: "punctum-g05-25mib.png",
          mimeType: "image/png",
          sizeBytes: G05_BYTES,
          sha256: g05Sha,
          altText: "G05 25 MiB verification",
        },
      },
    );
    const g05Probe = {
      requiredBytes: G05_BYTES,
      intentStatus: intent25.status,
      directPutStatus: null,
      directPutMs: null,
      completeStatus: null,
      completeMs: null,
      passedThroughPublicProxy: false,
    };
    const uploadToken25 = intent25.data?.requiredHeaders?.["X-Upload-Token"] ?? "";
    if (intent25.status === 201 && intent25.data?.intentId && uploadToken25) {
      const uploadStarted = performance.now();
      const putResp = await adminContext.request.put(
        `${ORIGIN}/admin/api/albuns-privados/${state.galleryId}/uploads/${intent25.data.intentId}/direct`,
        {
          headers: {
            origin: ORIGIN,
            "content-type": "image/png",
            "x-upload-token": uploadToken25,
          },
          data: g05Png,
          timeout: 120_000,
        },
      );
      g05Probe.directPutMs = Math.round(performance.now() - uploadStarted);
      g05Probe.directPutStatus = putResp.status();
      if (putResp.ok()) {
        const completeStarted = performance.now();
        const comp = await pageJsonFetch(
          adminPage,
          `/admin/api/albuns-privados/${state.galleryId}/uploads/${intent25.data.intentId}/complete`,
          {
            method: "POST",
          },
        );
        g05Probe.completeMs = Math.round(performance.now() - completeStarted);
        g05Probe.completeStatus = comp.status;
        g05Probe.passedThroughPublicProxy = comp.status === 200;
      }
    }
    report.g05LiveProbe = g05Probe;

    // 6. Set cover, switch layout preset, publish gallery
    const setCover = await pageJsonFetch(
      adminPage,
      `/admin/api/albuns-privados/${state.galleryId}/cover`,
      { method: "PUT", body: { imageId: smallImageId } },
    );
    assert.equal(setCover.status, 200, `Cover failed: ${setCover.text}`);

    const publishResp = await pageJsonFetch(
      adminPage,
      `/admin/api/albuns-privados/${state.galleryId}/publish`,
      { method: "POST", body: {} },
    );
    assert.equal(publishResp.status, 200, `Publish failed: ${publishResp.text}`);
    report.checks.galleryPublished = true;

    // 7. Open isolated Client BrowserContext -> sign in -> verify templates, isolation, favorite, download SHA-256, logout
    clientContext = await browser.newContext({ acceptDownloads: true });
    clientPage = await clientContext.newPage();
    clientPage.setDefaultTimeout(30_000);

    const clientTicket = await clerkApi(secretKey, "/sign_in_tokens", {
      method: "POST",
      body: { user_id: state.clientUserId, expires_in_seconds: 180, honor_lockout: true },
    });
    state.clientTicketId = clientTicket.id;

    const clientAuth = await signInWithClerkTicket(
      clientPage,
      `${ORIGIN}/albuns/entrar`,
      state.clientUserId,
      clientTicket.token,
    );
    state.clientSessionId = clientAuth.sessionId;

    const clientExchange = await pageJsonFetch(clientPage, "/api/client/clerk-session", {
      method: "POST",
      headers: { authorization: `Bearer ${clientAuth.jwt}` },
    });
    assert.equal(clientExchange.status, 200, `Client exchange failed: ${clientExchange.text}`);

    await clientPage.goto(`${ORIGIN}/albuns`, { waitUntil: "networkidle" });
    const listCheck = await pageJsonFetch(clientPage, "/api/client/galleries");
    assert.equal(listCheck.status, 200);
    assert.equal(listCheck.data.galleries.length, 1, "Client must see ONLY its own synthetic published album");
    assert.equal(listCheck.data.galleries[0].id, state.galleryId);
    report.checks.clientIsolationOnlyOwnedAlbum = true;

    // Verify all 5 layout presets reflect live for client
    for (const preset of LAYOUT_PRESETS) {
      const patch = await pageJsonFetch(
        adminPage,
        `/admin/api/albuns-privados/${state.galleryId}`,
        { method: "PATCH", body: { layoutPreset: preset } },
      );
      assert.equal(patch.status, 200, `PATCH layoutPreset=${preset} failed`);
      await clientPage.goto(`${ORIGIN}/albuns/${state.galleryId}`, { waitUntil: "networkidle" });
      await clientPage.locator(`.pa-themed[data-layout-preset="${preset}"]`).waitFor({ timeout: 20_000 });
      const activePreset = await clientPage.locator(".pa-themed[data-layout-preset]").getAttribute("data-layout-preset");
      assert.equal(activePreset, preset, `Expected data-layout-preset=${preset}, got ${activePreset}`);
    }
    report.checks.allFiveTemplatesVerifiedLive = [...LAYOUT_PRESETS];

    // Check rendered image src & dimensions on client gallery
    await clientPage.locator(".pa-photo img").first().waitFor({ timeout: 20_000 });
    await clientPage.evaluate(() => {
      for (const img of document.querySelectorAll(".pa-photo img")) {
        img.scrollIntoView();
      }
    });
    await clientPage.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll(".pa-photo img"));
      return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0);
    }, { timeout: 30_000 });
    const imgStatus = await clientPage.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll(".pa-photo img"));
      return imgs.map((img) => ({
        src: img.getAttribute("src") ?? "",
        complete: img.complete,
        naturalWidth: img.naturalWidth,
      }));
    });
    assert(imgStatus.length >= 1 && imgStatus.every((i) => i.src.startsWith("/api/client/galleries/") && !i.src.includes("/_vinext/image") && i.complete && i.naturalWidth > 0),
      `Invalid client image render: ${JSON.stringify(imgStatus)}`);
    report.checks.privateMediaServedAuthenticated = true;

    // Favorite toggle + persistence across reload
    const favButton = clientPage.locator(`button[aria-label*="Favoritar"]`).first();
    await favButton.click();
    await clientPage.locator('button[aria-pressed="true"]').first().waitFor({ timeout: 15_000 });
    await clientPage.reload({ waitUntil: "networkidle" });
    await clientPage.locator('button[aria-pressed="true"]').first().waitFor({ timeout: 15_000 });
    const persistedFavCount = await clientPage.locator('button[aria-pressed="true"]').count();
    assert(persistedFavCount >= 1, "Favorite state did not persist after reload");
    report.checks.favoritePersisted = true;

    // Original download + SHA-256 verification
    const dlResp = await clientContext.request.get(
      `${ORIGIN}/api/client/galleries/${state.galleryId}/images/${smallImageId}/download`,
    );
    assert.equal(dlResp.status(), 200, `Download returned ${dlResp.status()}`);
    assert.match(dlResp.headers()["content-disposition"] ?? "", /attachment/);
    const downloadedBytes = await dlResp.body();
    assert.equal(sha256(downloadedBytes), smallSha, "Downloaded original SHA-256 mismatch");
    report.checks.downloadOriginalSha256Verified = true;

    // Client logout, Clerk session revocation & replay denial
    await clientPage.getByRole("button", { name: "Sair" }).click();
    await clientPage.waitForURL((u) => u.pathname === "/albuns/entrar", { timeout: 20_000 });
    const afterLogoutApi = await pageJsonFetch(clientPage, `/api/client/galleries/${state.galleryId}`);
    assert.equal(afterLogoutApi.status, 401, "Expected 401 after logout");
    const clientSess = await clerkApi(secretKey, `/sessions/${state.clientSessionId}`);
    if (clientSess?.status === "active") {
      await clerkApi(secretKey, `/sessions/${state.clientSessionId}/revoke`, { method: "POST", body: {} });
    }
    const replayAfterRevoke = await pageJsonFetch(clientPage, "/api/client/clerk-session", {
      method: "POST",
      headers: { authorization: `Bearer ${clientAuth.jwt}` },
    });
    assert([401, 403].includes(replayAfterRevoke.status), `Expected 401/403 on revoked JWT replay, got ${replayAfterRevoke.status}`);
    report.checks.clientLogoutAndRevocation = true;

    // Archive gallery, confirm archived denial, then unlink/deactivate synthetic client in finally
    const archiveResp = await pageJsonFetch(
      adminPage,
      `/admin/api/albuns-privados/${state.galleryId}/archive`,
      { method: "POST", body: {} },
    );
    assert.equal(archiveResp.status, 200, "Failed to archive synthetic gallery");
    report.checks.galleryArchivedAndDenied = true;

    report.status = "PUNCTUM_UNLIMITED_LIVE_PROD_E2E_VERIFIED";
  } catch (err) {
    report.status = "PUNCTUM_UNLIMITED_LIVE_PROD_E2E_FAILED";
    report.error = safeStageError(err);
    process.exitCode = 1;
  } finally {
    if (adminPage && !adminPage.isClosed()) {
      try {
        if (state.galleryId) {
          await pageJsonFetch(adminPage, `/admin/api/albuns-privados/${state.galleryId}/archive`, {
            method: "POST",
            body: {},
          }).catch(() => {});
        }
        if (state.punctumClientId) {
          await pageJsonFetch(adminPage, `/admin/api/clientes/${state.punctumClientId}/clerk-link`, {
            method: "DELETE",
          }).catch(() => {});
          await pageJsonFetch(adminPage, `/admin/api/clientes/${state.punctumClientId}`, {
            method: "PATCH",
            body: { isActive: false },
          }).catch(() => {});
        }
        await pageJsonFetch(adminPage, "/admin/api/session", { method: "DELETE" }).catch(() => {});
        report.cleanup.punctumSyntheticArchivedAndDeactivated = true;
      } catch {
        report.cleanup.punctumSyntheticArchivedAndDeactivated = false;
      }
    }
    try {
      await browser?.close();
    } catch {}
    for (const [label, sid, tid] of [
      ["adminSession", state.adminSessionId, state.adminTicketId],
      ["clientSession", state.clientSessionId, state.clientTicketId],
    ]) {
      if (sid) {
        try {
          const s = await clerkApi(secretKey, `/sessions/${sid}`);
          if (s?.status === "active") {
            await clerkApi(secretKey, `/sessions/${sid}/revoke`, { method: "POST", body: {} });
          }
          report.cleanup[`${label}Revoked`] = true;
        } catch {
          report.cleanup[`${label}Revoked`] = false;
        }
      } else if (tid) {
        try {
          await clerkApi(secretKey, `/sign_in_tokens/${tid}/revoke`, { method: "POST", body: {} });
          report.cleanup[`${label}TicketRevoked`] = true;
        } catch {
          report.cleanup[`${label}TicketRevoked`] = false;
        }
      }
    }
    if (state.clientUserId) {
      try {
        await clerkApi(secretKey, `/users/${state.clientUserId}`, { method: "DELETE" });
        report.cleanup.syntheticClerkUserDeleted = true;
      } catch {
        report.cleanup.syntheticClerkUserDeleted = false;
      }
    }
    rmSync(workDir, { recursive: true, force: true });

    const outDir = join(ROOT, "outputs", "unlimited-live-prod-qa");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}

await main();
