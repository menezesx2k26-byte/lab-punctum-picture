/**
 * Dedicated real-Chromium visual, functional & accessibility QA for the five
 * private album templates (`classico`, `editorial`, `colagem`, `mosaico`, `cinema`)
 * against the compiled Hostinger candidate Node server with isolated synthetic SQLite + storage.
 *
 * Covers Goal R4 §6.3 and Plan Tarefa 3 without touching remote/production resources.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { chromium } from "playwright";
import { withProofDatabase } from "../hostinger-clerk-production-proof.mjs";
import { summarizeAxeAudit } from "./accessibility-evidence.mjs";
import { takeEvidenceScreenshot } from "./screenshot-evidence.mjs";

const LAYOUTS = ["classico", "editorial", "colagem", "mosaico", "cinema"];
const THEMES = ["noir", "ivory", "warm"];
const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
];
const OUTPUT_DIR = resolve(process.env.PUNCTUM_TEMPLATES_QA_OUTPUT || "outputs/templates-qa");
const ROOT = resolve(new URL("../../", import.meta.url).pathname);

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function freePort() {
  return new Promise((done, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => done(port));
    });
  });
}

async function makePhotoPng(width, height, bgHex, accentHex, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${bgHex}"/>
    <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.84)}" height="${Math.round(height * 0.84)}" fill="none" stroke="${accentHex}" stroke-width="6"/>
    <circle cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.44)}" r="${Math.round(Math.min(width, height) * 0.18)}" fill="${accentHex}" opacity="0.85"/>
    <text x="50%" y="82%" text-anchor="middle" font-family="Georgia,serif" font-size="${Math.round(Math.min(width, height) * 0.08)}" fill="${accentHex}">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function waitForHealth(origin, child) {
  for (let i = 0; i < 60; i++) {
    assert(child.exitCode === null, "Candidate server exited prematurely");
    try {
      const res = await fetch(origin + "/api/health", { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch { /* starting */ }
    await delay(300);
  }
  throw new Error("Candidate server failed to become healthy");
}

async function stopServer(child) {
  if (!child?.pid || child.exitCode !== null) return;
  const exited = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}

async function checkNoOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(
    metrics.scrollWidth <= metrics.clientWidth + 1,
    `Horizontal overflow on ${label}: scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth}`,
  );
}

async function auditAxe(page, label, report) {
  await page.addScriptTag({ path: resolve("node_modules/axe-core/axe.min.js") });
  const raw = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    }),
  );
  const summary = summarizeAxeAudit(raw);
  report.accessibilityAudits.push({ label, ...summary });
  assert.deepEqual(summary.violations, [], `WCAG 2.1 A/AA violation on ${label}: ${JSON.stringify(summary.violations)}`);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const report = {
    status: "running",
    startedUtc: new Date().toISOString(),
    scope: "real Chromium against compiled Hostinger candidate server with isolated synthetic SQLite + storage (no remote/prod)",
    layouts: LAYOUTS,
    themes: THEMES,
    viewports: VIEWPORTS,
    checks: [],
    accessibilityAudits: [],
    screenshots: [],
    pageErrors: [],
    consoleErrors: [],
    expectedDenials: [],
    loopbackNotes: [],
    serverErrors: [],
  };
  const record = (msg) => {
    report.checks.push(msg);
    console.log("PASS " + msg);
  };

  // Generate diverse portrait, landscape & square synthetic studio photographs
  const palette = [
    ["#2c2526", "#e8dfd5"],
    ["#3e3431", "#d9c2b2"],
    ["#1f2529", "#c8d0d6"],
    ["#4b373c", "#f1e3d8"],
    ["#313932", "#d8e0d5"],
    ["#42352c", "#efe4d2"],
  ];
  const specs = [
    [1200, 800, "L01"],
    [600, 900, "P02"],
    [800, 800, "S03"],
    [1200, 800, "L04"],
    [600, 900, "P05"],
    [1200, 800, "L06"],
  ];
  const photos = [];
  for (let i = 0; i < 24; i++) {
    const [w, h] = specs[i % specs.length];
    const [bg, fg] = palette[i % palette.length];
    const tag = `${w > h ? "Psg" : h > w ? "Ret" : "Qdr"}-${String(i + 1).padStart(2, "0")}`;
    const bytes = await makePhotoPng(w, h, bg, fg, tag);
    photos.push({ name: `foto-${String(i + 1).padStart(2, "0")}.png`, width: w, height: h, bytes, sha256: hash(bytes) });
  }

  let child;
  let browser;
  await withProofDatabase(async (_db, { dbFile, directory }) => {
    for (const dir of ["originals", "backups"]) mkdirSync(join(directory, dir), { mode: 0o700 });
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const adminPassword = randomBytes(20).toString("hex");
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
        PUNCTUM_CANDIDATE_ADMIN_EMAIL: "maria-qa@example.test",
        PUNCTUM_CANDIDATE_ADMIN_PASSWORD_HASH: hash(adminPassword),
        PUNCTUM_CANDIDATE_ADMIN_SESSION_SECRET: randomBytes(48).toString("hex"),
        PUNCTUM_CANDIDATE_CLIENT_SESSION_SECRET: randomBytes(48).toString("hex"),
        PUNCTUM_CANDIDATE_ADMIN_AUTH_MODE: "legacy",
        PUNCTUM_CANDIDATE_CLIENT_AUTH_MODE: "password",
        PUNCTUM_CANDIDATE_CLERK_AUTH_ENABLED: "false",
        PUNCTUM_CANDIDATE_PRIVATE_GALLERIES_ENABLED: "true",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr = (stderr + d.toString()).slice(-2000); });
    try {
      await waitForHealth(origin, child).catch((e) => { throw new Error(e.message + "\n" + stderr); });

      // Helper for authenticated admin API calls
      const adminLogin = await fetch(origin + "/admin/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ email: "maria-qa@example.test", password: adminPassword }),
      });
      assert.equal(adminLogin.status, 200, "Admin login failed: " + stderr);
      const adminCookie = adminLogin.headers.getSetCookie().find((c) => c.startsWith("punctum_admin_session=")).split(";")[0];

      const adminFetch = async (path, method = "GET", body) => {
        const res = await fetch(origin + path, {
          method,
          headers: {
            Cookie: adminCookie,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(method !== "GET" ? { Origin: origin } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return res;
      };

      // Create synthetic client A and rotate password
      const clientRes = await adminFetch("/admin/api/clientes", "POST", {
        name: "Cliente Templates QA",
        email: "templates-qa@example.test",
      });
      assert.equal(clientRes.status, 201);
      const { client, temporaryPassword } = await clientRes.json();

      const clientLogin1 = await fetch(origin + "/api/client/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ email: "templates-qa@example.test", password: temporaryPassword }),
      });
      assert.equal(clientLogin1.status, 200);
      let clientCookie = clientLogin1.headers.getSetCookie().find((c) => c.startsWith("punctum_client_session=")).split(";")[0];
      const finalPassword = "Punctum-QA-Password-2026!";
      const rotRes = await fetch(origin + "/api/client/password", {
        method: "POST",
        headers: { Cookie: clientCookie, "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ password: finalPassword }),
      });
      assert.equal(rotRes.status, 200);
      clientCookie = rotRes.headers.getSetCookie().find((c) => c.startsWith("punctum_client_session=")).split(";")[0];

      // Helper to upload synthetic photos into a gallery via real upload flow
      async function uploadPhotos(galleryId, items) {
        const imageIds = [];
        for (const photo of items) {
          const intentRes = await adminFetch(`/admin/api/albuns-privados/${galleryId}/uploads/intents`, "POST", {
            filename: photo.name,
            mimeType: "image/png",
            sizeBytes: photo.bytes.length,
            sha256: photo.sha256,
            altText: `Fotografia ${photo.name}`,
          });
          assert.equal(intentRes.status, 201);
          const intent = await intentRes.json();
          const putRes = await fetch(new URL(intent.uploadUrl, origin), {
            method: "PUT",
            headers: { Cookie: adminCookie, Origin: origin, ...intent.requiredHeaders },
            body: photo.bytes,
          });
          assert(putRes.status === 200 || putRes.status === 201, `Upload failed ${putRes.status}`);
          const compRes = await adminFetch(`/admin/api/albuns-privados/${galleryId}/uploads/${intent.intentId}/complete`, "POST");
          assert.equal(compRes.status, 200);
          imageIds.push(intent.imageId);
        }
        return imageIds;
      }

      // Seed 3 galleries:
      // 1) Empty published (simulate published gallery whose images are soft-deleted or empty state)
      //    Note: publish requires 1 ready cover, so we upload 1 photo, publish, then verify empty state via a soft-deleted cover gallery OR test 1-photo + 24-photo + empty draft/published-empty!
      const createGallery = async (title, layoutPreset, theme = "ivory", allowDownloads = true) => {
        const r = await adminFetch("/admin/api/albuns-privados", "POST", {
          clientId: client.id,
          title,
          introduction: "Ensaio sintético para validação visual e acessível dos cinco templates.",
          theme,
          layoutPreset,
          allowDownloads,
        });
        assert.equal(r.status, 201);
        return (await r.json()).gallery.id;
      };

      const gEmpty = await createGallery("Álbum Vazio QA", "classico", "ivory", false);
      const emptyImgIds = await uploadPhotos(gEmpty, [photos[0]]);
      await adminFetch(`/admin/api/albuns-privados/${gEmpty}/cover`, "PUT", { imageId: emptyImgIds[0] });
      assert.equal((await adminFetch(`/admin/api/albuns-privados/${gEmpty}/publish`, "POST")).status, 200);
      // Soft-delete the single photo directly in isolated synthetic DB to exercise the 0-photo empty state
      await _db.prepare("UPDATE client_gallery_images SET deleted_at=datetime('now') WHERE gallery_id=?").bind(gEmpty).run();

      const gSingle = await createGallery("Álbum Uma Foto QA", "editorial", "warm", true);
      const singleIds = await uploadPhotos(gSingle, [photos[1]]);
      await adminFetch(`/admin/api/albuns-privados/${gSingle}/cover`, "PUT", { imageId: singleIds[0] });
      assert.equal((await adminFetch(`/admin/api/albuns-privados/${gSingle}/publish`, "POST")).status, 200);

      const gMixed24 = await createGallery("Ensaio Completo 24 Fotos QA", "colagem", "noir", true);
      const mixedIds = await uploadPhotos(gMixed24, photos);
      await adminFetch(`/admin/api/albuns-privados/${gMixed24}/cover`, "PUT", { imageId: mixedIds[0] });
      assert.equal((await adminFetch(`/admin/api/albuns-privados/${gMixed24}/publish`, "POST")).status, 200);

      browser = await chromium.launch({ headless: true });

      let expectRevokedReload = false;
      const attachListeners = (page) => {
        page.on("pageerror", (e) => report.pageErrors.push(e.message));
        page.on("console", (m) => {
          if (m.type() !== "error") return;
          const text = m.text();
          if (text.includes("https://punctumpicture.com/favicon")) {
            report.loopbackNotes.push(text);
            return;
          }
          if (expectRevokedReload && /status of (401|404)\b/.test(text)) {
            report.expectedDenials.push(text);
            return;
          }
          report.consoleErrors.push(text);
        });
        page.on("response", (r) => {
          if (r.status() >= 500) report.serverErrors.push(`${r.status()} ${new URL(r.url()).pathname}`);
        });
      };

      // ================================================================
      // 1. ADMIN TEMPLATE PICKER QA (create + edit, mouse + keyboard, draft stays draft)
      // ================================================================
      const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const [adminName, adminVal] = adminCookie.split("=");
      await adminCtx.addCookies([{ name: adminName, value: adminVal, url: origin }]);
      const adminPage = await adminCtx.newPage();
      attachListeners(adminPage);

      await adminPage.goto(origin + "/admin/albuns-privados");
      await adminPage.locator(".pga-template-card").first().waitFor();
      assert.equal(await adminPage.locator(".pga-template-card").count(), 5, "Picker must render exactly 5 cards");

      // Verify synthetic previews contain zero <img> and zero external URLs
      const previewCheck = await adminPage.evaluate(() => {
        const previews = Array.from(document.querySelectorAll(".pga-template-preview"));
        return {
          count: previews.length,
          hasImg: previews.some((p) => p.querySelector("img") !== null),
          hasUrlBg: previews.some((p) => getComputedStyle(p).backgroundImage.includes("url(")),
        };
      });
      assert.deepEqual(previewCheck, { count: 5, hasImg: false, hasUrlBg: false });

      // Verify touch targets >= 44px on every template card
      const cardSizes = await adminPage.locator(".pga-template-card").evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { width: r.width, height: r.height };
        }),
      );
      assert(cardSizes.every((s) => s.width >= 44 && s.height >= 44), "Every template card must be >=44px");

      // Keyboard selection on create page: focus Editorial and press Space
      const editorialCard = adminPage.getByRole("button", { name: /Editorial/i });
      await editorialCard.focus();
      await adminPage.keyboard.press("Space");
      assert.equal(await editorialCard.getAttribute("aria-pressed"), "true");

      // Create draft album via UI with Editorial selected -> must stay draft
      await adminPage.getByLabel("Título", { exact: true }).fill("Rascunho Seletor QA");
      await adminPage.locator(`select option[value="${client.id}"]`).waitFor({ state: "attached" });
      await adminPage.getByRole("combobox", { name: /^Cliente/ }).selectOption(client.id);
      await adminPage.getByRole("button", { name: "Criar rascunho", exact: true }).click();
      await adminPage.waitForURL(/\/admin\/albuns-privados\/[a-f0-9-]+$/);
      const draftGalleryId = new URL(adminPage.url()).pathname.split("/").at(-1);
      await adminPage.locator(".pga-template-card").first().waitFor();
      assert.equal(await adminPage.getByRole("button", { name: /Editorial/i }).getAttribute("aria-pressed"), "true");
      assert.equal(await adminPage.locator(".pga-badge").first().textContent(), "Rascunho");

      // Clicking another template card in edit mode must NOT publish and must stay unsaved until "Salvar alterações"
      await adminPage.getByRole("button", { name: /Cinema/i }).click();
      assert.equal(await adminPage.getByRole("button", { name: /Cinema/i }).getAttribute("aria-pressed"), "true");
      const beforeSaveRow = await _db.prepare("SELECT status, layout_preset FROM client_galleries WHERE id=?").bind(draftGalleryId).first();
      assert.equal(beforeSaveRow.status, "draft");
      assert.equal(beforeSaveRow.layout_preset, "editorial", "Selecting a card must stay unsaved until explicit save");

      await Promise.all([
        adminPage.waitForResponse((r) => r.url().endsWith("/admin/api/albuns-privados/" + draftGalleryId) && r.request().method() === "PATCH"),
        adminPage.getByRole("button", { name: "Salvar alterações", exact: true }).click(),
      ]);
      const afterSaveRow = await _db.prepare("SELECT status, layout_preset FROM client_galleries WHERE id=?").bind(draftGalleryId).first();
      assert.equal(afterSaveRow.status, "draft", "Saving template must NOT auto-publish album");
      assert.equal(afterSaveRow.layout_preset, "cinema");

      await auditAxe(adminPage, "admin-template-picker-desktop", report);
      await takeEvidenceScreenshot(adminPage, join(OUTPUT_DIR, "admin-picker-desktop-1440.png"));
      report.screenshots.push("admin-picker-desktop-1440.png");

      for (const vp of VIEWPORTS) {
        await adminPage.setViewportSize(vp);
        await checkNoOverflow(adminPage, `admin-picker-${vp.width}px`);
      }
      await adminPage.setViewportSize({ width: 390, height: 844 });
      await takeEvidenceScreenshot(adminPage, join(OUTPUT_DIR, "admin-picker-mobile-390.png"));
      report.screenshots.push("admin-picker-mobile-390.png");
      record("Admin template picker: 5 cards, synthetic previews, keyboard/mouse selection, draft-not-published, WCAG 2.1 AA 0 violations, responsive 320-1440px");
      await adminCtx.close();

      // ================================================================
      // 2. CLIENT GALLERY QA ACROSS ALL 5 TEMPLATES, 3 THEMES, EDGE CASES
      // ================================================================
      const clientCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const [cName, cVal] = clientCookie.split("=");
      await clientCtx.addCookies([{ name: cName, value: cVal, url: origin }]);
      const page = await clientCtx.newPage();
      attachListeners(page);

      // 2a. Empty album across all 5 templates
      for (const layout of LAYOUTS) {
        assert.equal((await adminFetch(`/admin/api/albuns-privados/${gEmpty}`, "PATCH", { layoutPreset: layout })).status, 200);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(origin + "/albuns/" + gEmpty);
        await page.getByText("Nenhuma foto disponível neste álbum.", { exact: true }).waitFor();
        assert.equal(await page.locator(".pa-themed").getAttribute("data-layout-preset"), layout);
        await checkNoOverflow(page, `empty-${layout}-1280px`);
      }
      record("Empty album (0 photos) renders cleanly across all 5 templates with zero overflow");

      // 2b. Single photo album across all 5 templates
      for (const layout of LAYOUTS) {
        assert.equal((await adminFetch(`/admin/api/albuns-privados/${gSingle}`, "PATCH", { layoutPreset: layout })).status, 200);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(origin + "/albuns/" + gSingle);
        await page.locator(".pa-photo img").first().waitFor();
        assert.equal(await page.locator(".pa-photo").count(), 1);
        assert.equal(await page.locator(".pa-themed").getAttribute("data-layout-preset"), layout);
        const box = await page.locator(".pa-photo").first().boundingBox();
        assert(box && box.width > 400, `Single photo in ${layout} should not be squeezed into a narrow column (got ${box?.width}px)`);
        await checkNoOverflow(page, `single-${layout}-1280px`);
      }
      record("Single-photo album renders balanced and uncropped across all 5 templates");

      // 2c. 24-photo mixed portrait+landscape album across all 5 templates + 3 themes + all 6 viewports
      for (let idx = 0; idx < LAYOUTS.length; idx++) {
        const layout = LAYOUTS[idx];
        const theme = THEMES[idx % THEMES.length];
        assert.equal((await adminFetch(`/admin/api/albuns-privados/${gMixed24}`, "PATCH", { layoutPreset: layout, theme })).status, 200);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(origin + "/albuns/" + gMixed24);
        await page.locator(".pa-photo img").first().waitFor();
        assert.equal(await page.locator(".pa-themed").getAttribute("data-layout-preset"), layout);
        assert.equal(await page.locator(".pa-photo").count(), 24);

        // Scroll through the page so all 24 lazy-loaded images trigger and decode before assertions & full-page evidence
        const imgCheck = await page.evaluate(async () => {
          const imgs = Array.from(document.querySelectorAll(".pa-photo img"));
          for (const img of imgs) {
            img.scrollIntoView({ behavior: "instant", block: "center" });
            if (!(img.complete && img.naturalWidth > 0)) {
              await new Promise((res) => {
                img.addEventListener("load", res, { once: true });
                img.addEventListener("error", res, { once: true });
                setTimeout(res, 5000);
              });
            }
          }
          window.scrollTo(0, 0);
          const captions = Array.from(document.querySelectorAll(".pa-photo figcaption > span")).map((s) => s.textContent?.trim());
          const allPrivate = imgs.every((img) => {
            const src = img.getAttribute("src") || "";
            return src.startsWith("/api/client/galleries/") && !src.includes("/_vinext/image");
          });
          const noCrop = imgs.every((img) => getComputedStyle(img).objectFit !== "cover");
          const decodedAll = imgs.every((img) => img.naturalWidth > 0 && img.naturalHeight > 0);
          return { captions, allPrivate, noCrop, decodedAll };
        });
        assert.equal(imgCheck.allPrivate, true, `All images in ${layout} must use private authenticated routes`);
        assert.equal(imgCheck.noCrop, true, `Template ${layout} must not force object-fit: cover cropping`);
        assert.equal(imgCheck.decodedAll, true, `All 24 mixed portrait/landscape images must decode in ${layout}`);
        assert.deepEqual(
          imgCheck.captions,
          Array.from({ length: 24 }, (_, n) => String(n + 1).padStart(2, "0")),
          `Template ${layout} must preserve strict photo order`,
        );

        await auditAxe(page, `gallery-${layout}-${theme}-1440`, report);
        const deskShot = `template-${layout}-${theme}-desktop-1440.png`;
        await takeEvidenceScreenshot(page, join(OUTPUT_DIR, deskShot));
        report.screenshots.push(deskShot);

        for (const vp of VIEWPORTS) {
          await page.setViewportSize(vp);
          await checkNoOverflow(page, `gallery-${layout}-${vp.width}px`);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        const mobShot = `template-${layout}-${theme}-mobile-390.png`;
        await takeEvidenceScreenshot(page, join(OUTPUT_DIR, mobShot));
        report.screenshots.push(mobShot);
      }
      record("All 5 templates verified with 24 mixed portrait+landscape photos across noir/ivory/warm, strict order, zero forced crop, private URLs, WCAG 2.1 AA 0 violations, 320-1440px");

      // 2d. Favorites persistence, Downloads ON vs OFF, Lightbox keyboard + Escape + focus restoration
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(origin + "/albuns/" + gMixed24);
      const favBtn = page.locator(".pa-photo figcaption button").first();
      await favBtn.waitFor();
      assert.equal(await favBtn.getAttribute("aria-pressed"), "false");
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("/favorites/") && r.request().method() === "PUT"),
        favBtn.click(),
      ]);
      await page.locator('.pa-photo figcaption button[aria-pressed="true"]').first().waitFor();
      assert.equal(await favBtn.getAttribute("aria-pressed"), "true");
      await page.reload();
      const reloadedFavBtn = page.locator(".pa-photo figcaption button").first();
      await reloadedFavBtn.waitFor();
      assert.equal(await reloadedFavBtn.getAttribute("aria-pressed"), "true", "Favorite must persist across reload");
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("/favorites/") && r.request().method() === "DELETE"),
        reloadedFavBtn.click(),
      ]);
      await page.locator('.pa-photo figcaption button[aria-pressed="false"]').first().waitFor();
      await page.reload();
      await page.locator(".pa-photo figcaption button").first().waitFor();
      assert.equal(await page.locator(".pa-photo figcaption button").first().getAttribute("aria-pressed"), "false", "Unfavorite must persist across reload");

      // Download enabled: link present & exact original SHA-256
      const dlHref = await page.locator(".pa-photo figcaption a[download]").first().getAttribute("href");
      assert(dlHref && dlHref.endsWith("/download"));
      const dlRes = await clientCtx.request.get(origin + dlHref);
      assert.equal(dlRes.status(), 200);
      assert.equal(hash(await dlRes.body()), photos[0].sha256, "Downloaded original SHA-256 mismatch");

      // Lightbox keyboard navigation + Escape + focus restoration
      const opener = page.locator(".pa-photo-open").first();
      await opener.click();
      const dialog = page.getByRole("dialog", { name: "Visualização da fotografia" });
      await dialog.waitFor();
      assert(await dialog.getByText("1 / 24").isVisible());
      await page.keyboard.press("ArrowRight");
      await dialog.getByText("2 / 24").waitFor();
      await page.keyboard.press("ArrowLeft");
      await dialog.getByText("1 / 24").waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await opener.evaluate((el) => el === document.activeElement), true, "Escape must restore focus to opening photo");

      // Download disabled: UI hides link & API denies 403
      assert.equal((await adminFetch(`/admin/api/albuns-privados/${gMixed24}`, "PATCH", { allowDownloads: false })).status, 200);
      await page.reload();
      await page.locator(".pa-photo").first().waitFor();
      assert.equal(await page.locator(".pa-photo figcaption a[download]").count(), 0, "Download link must hide when disabled");
      const dlDenied = await clientCtx.request.get(origin + dlHref);
      assert.equal(dlDenied.status(), 403);
      record("Favorites persistence, download ON/OFF (SHA-256 + 403), and lightbox Arrow/Escape/focus verified");

      // 2e. Expired / revoked session state
      await _db.prepare("UPDATE client_accounts SET session_version = session_version + 1 WHERE id=?").bind(client.id).run();
      expectRevokedReload = true;
      try {
        await page.reload();
        await page.waitForURL(/\/albuns\/entrar/);
      } finally {
        expectRevokedReload = false;
      }
      assert.equal(await page.locator(".pa-photo").count(), 0, "Revoked session must not expose photos");
      record("Expired/revoked session redirects cleanly to /albuns/entrar with zero leaked photos");

      await clientCtx.close();
      assert.deepEqual(report.pageErrors, [], "Page errors: " + JSON.stringify(report.pageErrors));
      assert.deepEqual(report.consoleErrors, [], "Console errors: " + JSON.stringify(report.consoleErrors));
      assert.deepEqual(report.serverErrors, [], "Server 5xx errors: " + JSON.stringify(report.serverErrors));
      report.status = "PASS_LOCAL_SYNTHETIC_TEMPLATES_QA";
    } catch (error) {
      report.status = "FAILED";
      report.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      await browser?.close();
      await stopServer(child);
      report.completedUtc = new Date().toISOString();
      await writeFile(join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2) + "\n");
    }
  });

  console.log("Templates QA report: " + join(OUTPUT_DIR, "report.json"));
}

await main();
