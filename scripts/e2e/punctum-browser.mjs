/**
 * Production-build browser checks against fresh local workerd, D1 and R2 only.
 * No Cloudflare account, remote database, user browser profile or real OTP is used.
 * Run after `npm run build`; see scripts/e2e/README.md.
 */
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { globSync } from "node:fs";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const buildDirectory = resolve(process.env.PUNCTUM_E2E_DIST || "dist");
const reportDirectory = resolve(process.env.PUNCTUM_E2E_OUTPUT || "outputs/browser-e2e");
const sourceSha = process.env.PUNCTUM_E2E_BUILD_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const temporary = await mkdtemp(join(tmpdir(), "punctum-browser-e2e-"));
const storage = join(temporary, "storage");
const snapshot = join(temporary, "rollback");
const sessionSecret = randomBytes(32).toString("base64url");
const adminSecret = randomBytes(32).toString("base64url");
const adminHash = createHash("sha256").update(randomBytes(32)).digest("hex");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg==", "base64");
const report = {
  status: "running", startedUtc: new Date().toISOString(), sourceSha,
  sourceRevisionProvided: Boolean(process.env.PUNCTUM_E2E_BUILD_SHA),
  checkoutDirtyAtRun: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
  buildSha256: createHash("sha256").update(await readFile(join(buildDirectory, "server/index.js"))).digest("hex"),
  scope: "real Chromium against production bundle in local workerd with new synthetic D1/R2",
  cloudflareAccessOtpTested: false, remoteQaTouched: false, productionTouched: false,
  syntheticSessionOnly: true, physicalDevicesTested: false, reducedMotion: "reduce", checks: [], pageErrors: [], consoleWarnings: [], consoleErrors: [], expectedDenials: [], serverErrors: [],
};
await mkdir(reportDirectory, { recursive: true });
const record = (check) => { report.checks.push(check); console.log("PASS " + check); };
const sign = (payload, secret) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
};
const listenPort = await new Promise((resolvePort, reject) => {
  const socket = createServer(); socket.on("error", reject);
  socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(() => resolvePort(port)); });
});
const origin = "http://127.0.0.1:" + listenPort;
const serverRoot = join(buildDirectory, "server");
const options = convertV4MiniflareOptions({
  name: "punctum-isolated-browser-e2e",
  modules: [
    { type: "ESModule", path: join(serverRoot, "index.js") },
    ...globSync(join(serverRoot, "**/*.js")).filter((p) => p !== join(serverRoot, "index.js")).map((path) => ({ type: "ESModule", path })),
  ],
  modulesRoot: serverRoot, compatibilityDate: "2026-05-22", compatibilityFlags: ["nodejs_compat"],
  host: "127.0.0.1", port: listenPort,
  assets: { directory: join(buildDirectory, "client"), binding: "ASSETS", run_worker_first: ["/albuns", "/albuns/*", "/_vinext/image", "/api/*", "/admin/*", "/media/*", "/sitemap.xml", "/robots.txt"], routerConfig: { has_user_worker: true } },
  images: { binding: "IMAGES" },
  d1Databases: { DB: "punctum-browser-e2e-d1" },
  r2Buckets: { ORIGINALS: "punctum-browser-e2e-originals", BACKUPS: "punctum-browser-e2e-backups" },
  bindings: {
    ENVIRONMENT: "preview", SITE_ORIGIN: origin, PUBLIC_SITE_URL: origin,
    PRIVATE_GALLERIES_ENABLED: "true", CLIENT_AUTH_MODE: "access", CLIENT_SESSION_SECRET: sessionSecret,
    ADMIN_SESSION_SECRET: adminSecret, ADMIN_PASSWORD_HASH: adminHash, ADMIN_ALLOWED_EMAILS: "qa@punctum.invalid",
    MAX_UPLOAD_BYTES: "26214400", ALLOWED_MIME_TYPES: "image/jpeg,image/png,image/webp",
    PUBLIC_WHATSAPP_E164: "5511999999999", PUBLIC_INSTAGRAM_URL: "https://instagram.com/punctumpicture",
    ADMIN_RATE_LIMIT_WINDOW_SECONDS: "60", ADMIN_RATE_LIMIT_MAX: "200",
  },
});
options.resourcePersistencePath = storage;
options.telemetry = { enabled: false };
let mf, browser;
const contexts = [];
const expectedDenialPaths = new Set();
const start = async () => { mf = new Miniflare(options); await mf.ready; };
const newContext = async (viewport = { width: 1280, height: 900 }) => {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" }); contexts.push(context);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === origin || url.protocol === "data:" ? route.continue() : route.abort("blockedbyclient");
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => report.pageErrors.push(error.message));
    page.on("console", (message) => { if (["warning", "warn"].includes(message.type())) report.consoleWarnings.push(message.text()); if (message.type() === "error") {
      const observed = { message: message.text(), path: message.location().url ? new URL(message.location().url).pathname : null };
      if (expectedDenialPaths.has(observed.path) && observed.message === "Failed to load resource: the server responded with a status of 404 (Not Found)") report.expectedDenials.push(observed);
      else report.consoleErrors.push(observed);
    } });
    page.on("response", (response) => {
      if (response.status() >= 500) report.serverErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
    });
  });
  return context;
};
const addClientCookie = (context, id, version = 1) => {
  const now = Math.floor(Date.now() / 1000);
  return context.addCookies([{ name: "punctum_client_session", value: sign({ sub: id, version, iat: now, exp: now + 3600, audience: "punctum-client-access" }, sessionSecret), url: origin, httpOnly: true, sameSite: "Strict" }]);
};
const noHorizontalOverflow = async (page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow");
const privateHeaders = (response) => {
  assert.equal(response.headers()["cache-control"], "private, no-store");
  assert.match(response.headers()["x-robots-tag"] || "", /noindex/);
};
try {
  await start();
  const db = await mf.getD1Database("DB");
  const originals = await mf.getR2Bucket("ORIGINALS");
  for (const path of globSync(resolve("migrations/*.sql")).sort()) {
    for (const statement of (await readFile(path, "utf8")).split(";").map((sql) => sql.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  const clients = [];
  for (const label of ["A", "B"]) {
    const client = { label, id: randomUUID(), gallery: randomUUID(), images: [] };
    await db.prepare("INSERT INTO client_accounts (id,name,email,password_hash,password_salt,password_iterations,must_change_password,session_version,created_at,updated_at) VALUES (?,?,?,'unused','unused',310000,0,1,datetime('now'),datetime('now'))")
      .bind(client.id, "Cliente sintético " + label, `browser-${client.id}@example.invalid`).run();
    await db.prepare("INSERT INTO client_galleries (id,client_id,title,introduction,theme,allow_downloads,status,created_at,updated_at,published_at) VALUES (?,?,?,?,'ivory',1,'published',datetime('now'),datetime('now'),datetime('now'))")
      .bind(client.gallery, client.id, "Álbum sintético " + label, "Somente dados fictícios de homologação local.").run();
    for (let i = 0; i < 5; i++) {
      const id = randomUUID(); const key = `client-galleries/${client.gallery}/${id}.png`;
      await originals.put(key, png, { httpMetadata: { contentType: "image/png" } });
      await db.prepare("INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,width,height,alt_text,position,status,created_at,updated_at) VALUES (?,?,?,'synthetic.png','image/png',?,2,2,?,?,'ready',datetime('now'),datetime('now'))")
        .bind(id, client.gallery, key, png.length, "Fotografia sintética " + label + " " + (i + 1), i).run();
      client.images.push(id);
    }
    await db.prepare("UPDATE client_galleries SET cover_image_id=? WHERE id=?").bind(client.images[0], client.gallery).run();
    clients.push(client);
  }
  record("fresh local D1/R2: two fictional clients, two albums and ten generated PNG originals");
  browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  report.browser = browser.version();
  const anonymous = await newContext();
  const unauthorized = await anonymous.request.get(origin + "/albuns", { maxRedirects: 0 });
  assert.equal(unauthorized.status(), 303, await unauthorized.text()); privateHeaders(unauthorized);
  assert.equal((await anonymous.request.get(origin + "/api/client/galleries")).status(), 401);
  assert.equal((await anonymous.request.post(origin + "/api/client/session", { headers: { Origin: origin }, data: { email: "nobody@example.invalid", password: "irrelevant" } })).status(), 405);
  record("anonymous gallery access denied; Access mode disables password login");
  const a = await newContext(); const b = await newContext();
  await addClientCookie(a, clients[0].id); await addClientCookie(b, clients[1].id);
  const pageA = await a.newPage(); const pageB = await b.newPage();
  for (const [context, page, own, foreign] of [[a, pageA, clients[0], clients[1]], [b, pageB, clients[1], clients[0]]]) {
    const response = await page.goto(origin + "/albuns"); assert.equal(response.status(), 200);
    await page.getByRole("heading", { name: "Álbum sintético " + own.label }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Álbum sintético " + foreign.label }).count(), 0);
    assert.equal((await context.request.get(origin + "/api/client/galleries/" + foreign.gallery)).status(), 404);
    assert.equal((await context.request.get(origin + `/api/client/galleries/${foreign.gallery}/images/${foreign.images[0]}/download`)).status(), 404);
  }
  record("real browser client A/B libraries and foreign gallery/original denial");
  await pageA.getByRole("link", { name: /Álbum sintético A/ }).click();
  await pageA.getByRole("heading", { name: "Álbum sintético A", exact: true }).waitFor();
  await pageA.waitForFunction(() => document.querySelector(".pa-photo img")?.naturalWidth > 0);
  await pageA.getByRole("button", { name: "Favoritar: Fotografia sintética A 1", exact: true }).click();
  await pageA.getByRole("button", { name: "Remover dos favoritos: Fotografia sintética A 1", exact: true }).waitFor();
  await pageA.reload();
  await pageA.getByRole("button", { name: "Remover dos favoritos: Fotografia sintética A 1", exact: true }).waitFor();
  const opener = pageA.getByRole("button", { name: "Abrir Fotografia sintética A 1", exact: true });
  await opener.click();
  const dialog = pageA.getByRole("dialog", { name: "Visualização da fotografia" }); await dialog.waitFor();
  await pageA.keyboard.press("ArrowRight"); await dialog.getByText("Fotografia sintética A 2", { exact: true }).waitFor();
  await pageA.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  assert.ok(await opener.evaluate((el) => el === document.activeElement), "lightbox restores keyboard focus");
  const downloadPromise = pageA.waitForEvent("download");
  await pageA.getByRole("link", { name: "Baixar Fotografia sintética A 1", exact: true }).click();
  const download = await downloadPromise;
  assert.deepEqual(await readFile(await download.path()), png);
  assert.equal((await b.request.put(origin + `/api/client/galleries/${clients[0].gallery}/favorites/${clients[0].images[0]}`, { headers: { Origin: origin } })).status(), 404);
  record("favorite persisted, keyboard lightbox navigation/Escape/focus and original download bytes verified");
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
    await pageA.setViewportSize({ width, height: 900 }); await noHorizontalOverflow(pageA);
  }
  await pageA.setViewportSize({ width: 390, height: 844 });
  await pageA.screenshot({ path: join(reportDirectory, "private-gallery-mobile.png"), fullPage: true });
  record("private gallery has no horizontal overflow at 320/390/768px");
  const media = `/api/client/galleries/${clients[0].gallery}/images/${clients[0].images[0]}/gallery`;
  assert.equal((await anonymous.request.get(origin + media)).status(), 404);
  assert.equal((await a.request.get(origin + "/_vinext/image?url=" + encodeURIComponent(media) + "&w=640&q=75")).status(), 404);
  assert.equal((await anonymous.request.get(origin + `/media/${clients[0].images[0]}/gallery`)).status(), 404);
  record("private media is denied anonymously and cannot enter public media/image optimizer");
  // Use the real hydrated router's public automation surface to preserve the client component.
  const second = { gallery: randomUUID(), image: randomUUID() };
  await db.prepare("INSERT INTO client_galleries (id,client_id,title,introduction,theme,allow_downloads,status,created_at,updated_at,published_at) VALUES (?,?,'Segundo álbum sintético A','','ivory',1,'published',datetime('now'),datetime('now'),datetime('now'))").bind(second.gallery, clients[0].id).run();
  const secondKey = `client-galleries/${second.gallery}/${second.image}.png`;
  await originals.put(secondKey, png, { httpMetadata: { contentType: "image/png" } });
  await db.prepare("INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,width,height,alt_text,position,status,created_at,updated_at) VALUES (?,?,?,'synthetic.png','image/png',?,2,2,'Segunda coleção A',0,'ready',datetime('now'),datetime('now'))").bind(second.image, second.gallery, secondKey, png.length).run();
  await pageA.evaluate((href) => window.next.router.push(href), "/albuns/" + second.gallery);
  await pageA.getByRole("heading", { name: "Segundo álbum sintético A", exact: true }).waitFor();
  assert.equal(await pageA.getByRole("heading", { name: "Álbum sintético A", exact: true }).count(), 0);
  const missing = randomUUID(); const missingPath = "/api/client/galleries/" + missing;
  expectedDenialPaths.add(missingPath);
  let releaseMissing, signalMissing;
  const missingStarted = new Promise((resolveStarted) => { signalMissing = resolveStarted; });
  await a.route(origin + missingPath, async (route) => {
    await new Promise((resolveRelease) => { releaseMissing = resolveRelease; signalMissing(); });
    await route.continue();
  });
  await pageA.evaluate((href) => window.next.router.push(href), "/albuns/" + missing);
  let missingDeadline;
  try {
    await Promise.race([missingStarted, new Promise((_, reject) => { missingDeadline = setTimeout(() => reject(new Error("client navigation did not request the next gallery")), 30_000); })]);
  } finally { clearTimeout(missingDeadline); }
  try {
    assert.equal(await pageA.getByRole("heading", { name: "Segundo álbum sintético A", exact: true }).count(), 0, "previous gallery cleared while the next gallery request is pending");
    assert.equal(await pageA.locator(".pa-photo").count(), 0, "previous photographs cleared on gallery navigation");
  } finally { releaseMissing(); }
  await pageA.getByRole("alert").first().waitFor();
  assert.equal(await pageA.locator(".pa-photo").count(), 0);
  await pageA.evaluate((href) => window.next.router.push(href), "/albuns/" + clients[0].gallery);
  await pageA.getByRole("heading", { name: "Álbum sintético A", exact: true }).waitFor();
  record("same-component client navigation clears prior gallery while pending and after an intentional404");
  const malformed = await newContext(); await addClientCookie(malformed, clients[0].id);
  await malformed.route(origin + "/api/client/galleries", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  const malformedPage = await malformed.newPage();
  await malformedPage.goto(origin + "/albuns");
  await malformedPage.getByRole("alert").first().waitFor();
  assert.equal(await malformedPage.locator(".pa-album-card").count(), 0);
  record("malformed success envelope produces a safe library alert without a render exception");
  const publicPage = await anonymous.newPage();
  const publicStart = performance.now();
  const home = await publicPage.goto(origin + "/"); assert.equal(home.status(), 200);
  await publicPage.locator("h1").first().waitFor();
  report.localBrowserHomeNavigationMs = performance.now() - publicStart;
  await publicPage.screenshot({ path: join(reportDirectory, "public-home.png"), fullPage: true });
  assert.equal((await anonymous.request.get(origin + "/admin/studio", { maxRedirects: 0 })).status(), 303);
  const admin = await newContext();
  await admin.addCookies([{ name: "punctum_admin_session", value: sign({ email: "qa@punctum.invalid", exp: Math.floor(Date.now() / 1000) + 3600 }, adminSecret + "\0env:" + adminHash), url: origin + "/admin", httpOnly: true, sameSite: "Strict" }]);
  const studio = await admin.newPage();
  assert.equal((await studio.goto(origin + "/admin/studio")).status(), 200);
  await studio.getByRole("heading", { name: "Studio", exact: true }).waitFor();
  await studio.getByRole("button", { name: "Textos", exact: true }).click();
  await studio.getByRole("heading", { name: "Textos do site", exact: true }).waitFor();
  await studio.screenshot({ path: join(reportDirectory, "studio.png"), fullPage: true });
  record("public home and authenticated Studio render; anonymous Studio denied");
  await studio.getByRole("button", { name: "Estilo", exact: true }).click();
  await studio.getByRole("button", { name: /^Colagem autoral/ }).click();
  await studio.getByRole("button", { name: "Publicar alterações", exact: true }).click();
  await studio.getByText("Alterações publicadas. O site já está atualizado.", { exact: true }).waitFor();
  await publicPage.reload();
  await publicPage.locator('[data-theme-preset="colagem-autoral"]').first().waitFor();
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
    await publicPage.setViewportSize({ width, height: 900 }); await noHorizontalOverflow(publicPage);
  }
  await publicPage.setViewportSize({ width: 390, height: 844 });
  await publicPage.screenshot({ path: join(reportDirectory, "colagem-mobile.png"), fullPage: true });
  record("Studio publishes Colagem Autoral locally; public preset renders without overflow at 320/390/768/1280px");
  // Exercise the private administration through hydrated forms, with fictional data only.
  await studio.goto(origin + "/admin/clientes");
  await studio.getByRole("button", { name: "Cadastrar cliente", exact: true }).waitFor();
  await studio.getByLabel("Nome", { exact: true }).fill("Cliente fictício browser");
  await studio.getByLabel("E-mail", { exact: true }).fill("browser-" + randomUUID() + "@example.invalid");
  const [createdClient] = await Promise.all([
    studio.waitForResponse(r => new URL(r.url()).pathname === "/admin/api/clientes" && r.request().method() === "POST"),
    studio.getByRole("button", { name: "Cadastrar cliente", exact: true }).click(),
  ]);
  assert.equal(createdClient.status(), 201);
  const browserClient = (await createdClient.json()).client;
  await studio.getByRole("heading", { name: "Cliente fictício browser", exact: true }).waitFor();
  assert.equal(await studio.getByLabel("Credencial temporária").count(), 0, "Access registration must not emit a password");
  await studio.goto(origin + "/admin/albuns-privados");
  await studio.getByLabel("Título", { exact: true }).fill("Galeria fictícia browser");
  await studio.getByRole("combobox", { name: /^Cliente/ }).selectOption(browserClient.id);
  await studio.getByRole("button", { name: "Criar rascunho", exact: true }).click();
  await studio.waitForURL(/\/admin\/albuns-privados\/[a-f0-9-]+$/);
  const browserGalleryId = new URL(studio.url()).pathname.split("/").at(-1);
  const browserGalleryApi = "/admin/api/albuns-privados/" + browserGalleryId;
  const publishButton = studio.getByRole("button", { name: "Publicar para o cliente", exact: true });
  await publishButton.waitFor();
  assert.equal(await publishButton.isDisabled(), true, "empty gallery publication is blocked");
  await studio.getByLabel("Adicionar fotos").setInputFiles({ name: "browser-synthetic.png", mimeType: "image/png", buffer: png });
  await studio.getByText("Concluído", { exact: true }).waitFor();
  assert.equal(await studio.getByRole("progressbar", { name: "Envio de browser-synthetic.png", exact: true }).getAttribute("value"), "100");
  const [coverResponse] = await Promise.all([
    studio.waitForResponse(r => new URL(r.url()).pathname === browserGalleryApi + "/cover" && r.request().method() === "PUT"),
    studio.getByRole("button", { name: "Usar na capa", exact: true }).click(),
  ]);
  assert.equal(coverResponse.status(), 200);
  await studio.getByRole("combobox", { name: /^Tema/ }).selectOption("ivory");
  await studio.getByLabel("Introdução", { exact: true }).fill("Somente dados fictícios para homologação.");
  const [saveResponse] = await Promise.all([
    studio.waitForResponse(r => new URL(r.url()).pathname === browserGalleryApi && r.request().method() === "PATCH"),
    studio.getByRole("button", { name: "Salvar alterações", exact: true }).click(),
  ]);
  assert.equal(saveResponse.status(), 200);
  const [publishResponse] = await Promise.all([
    studio.waitForResponse(r => new URL(r.url()).pathname === browserGalleryApi + "/publish" && r.request().method() === "POST"),
    publishButton.click(),
  ]);
  assert.equal(publishResponse.status(), 200);
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
    await studio.setViewportSize({ width, height: 900 }); await noHorizontalOverflow(studio);
  }
  await studio.setViewportSize({ width: 390, height: 844 });
  await studio.screenshot({ path: join(reportDirectory, "private-admin-mobile.png"), fullPage: true });
  const row = await db.prepare("SELECT status,theme,introduction FROM client_galleries WHERE id=?").bind(browserGalleryId).first();
  assert.equal(row.status, "published"); assert.equal(row.theme, "ivory");
  assert.equal(row.introduction, "Somente dados fictícios para homologação.");
  record("private admin browser creates Access client/gallery, uploads with progress, chooses cover and publishes; eight responsive widths");
  // Close live pages before the deliberately injected runtime restarts.
  await Promise.all(contexts.flatMap((context) => context.pages().map((page) => page.close())));
  // Persist only synthetic local data, stop workerd, then make a consistent snapshot.
  await mf.dispose(); mf = undefined;
  await cp(storage, snapshot, { recursive: true });
  await start();
  const persistedDb = await mf.getD1Database("DB");
  assert.equal((await persistedDb.prepare("SELECT COUNT(*) AS count FROM client_gallery_favorites WHERE client_id=?").bind(clients[0].id).first()).count, 1);
  assert.equal((await a.request.get(origin + "/api/client/galleries/" + clients[0].gallery)).status(), 200);
  assert.deepEqual(Buffer.from(await (await (await mf.getR2Bucket("ORIGINALS")).get(`client-galleries/${clients[0].gallery}/${clients[0].images[0]}.png`)).arrayBuffer()), png);
  record("workerd restart preserves favorites, authenticated gallery and original bytes");
  await persistedDb.prepare("UPDATE client_galleries SET status='archived' WHERE id=?").bind(clients[0].gallery).run();
  assert.equal((await a.request.get(origin + "/api/client/galleries/" + clients[0].gallery)).status(), 404);
  await mf.dispose(); mf = undefined;
  await rm(storage, { recursive: true, force: true }); await cp(snapshot, storage, { recursive: true });
  await start();
  assert.equal((await a.request.get(origin + "/api/client/galleries/" + clients[0].gallery)).status(), 200);
  const restoredPage = await a.newPage();
  await restoredPage.goto(origin + "/albuns/" + clients[0].gallery);
  await restoredPage.getByRole("heading", { name: "Álbum sintético A", exact: true }).waitFor();
  record("isolated local consistent-storage rollback restores gallery availability after archiving");
  await restoredPage.close();
  const logout = await a.request.delete(origin + "/api/client/session", { headers: { Origin: origin } });
  assert.equal(logout.status(), 200); assert.equal((await a.request.get(origin + "/api/client/me")).status(), 401);
  assert.equal((await b.request.get(origin + "/api/client/me")).status(), 200);
  record("logout revokes client A while client B remains authorized");
  assert.deepEqual(report.pageErrors, [], "unhandled browser exceptions");
  assert.deepEqual(report.serverErrors, [], "unexpected HTTP5xx in rendered pages");
  assert.deepEqual(report.consoleWarnings, [], "browser console warnings");
  assert.deepEqual(report.consoleErrors, [], "browser console errors");
  report.status = "PASS_LOCAL";
} catch (error) {
  report.status = "FAILED"; report.error = error.message; process.exitCode = 1;
  console.error(error);
} finally {
  await browser?.close(); await mf?.dispose();
  await rm(temporary, { recursive: true, force: true });
  report.completedUtc = new Date().toISOString(); report.temporaryStorageRemoved = true;
  await writeFile(join(reportDirectory, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("Browser report: " + join(reportDirectory, "report.json"));
}
