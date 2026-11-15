import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixturePng, fixtureSha256 } from "../services/punctum-hostinger-production/acceptance-fixture.mjs";

const origin = "https://aliceblue-locust-999458.hostingersite.com";
const marker = process.env.PUNCTUM_MANAGED_PROBE;
assert.match(marker ?? "", /^p[a-f0-9]{6}$/);
const output = "outputs/punctum-managed-acceptance";
mkdirSync(output, { recursive: true, mode: 0o700 });
const fixture = { schema: "punctum-managed-fixture-v1", marker, sourceSha: process.env.GITHUB_SHA,
  startedAt: new Date().toISOString(), albums: [], clients: [], galleries: [], images: [], inquiries: [] };
const report = { marker, checks: [], sourceSha: process.env.GITHUB_SHA };
let stage = "admin-login", adminCookie;
const persist = () => writeFileSync(join(output, "fixture.json"), JSON.stringify(fixture), { mode: 0o600 });
const check = (value, label) => { if (!value) throw Error(label); };
const request = async (path, method = "GET", body, cookie, extra = {}) => {
  const url = new URL(path, origin);
  check(url.origin === origin, "unexpected upload origin");
  const headers = { Origin: origin, ...(cookie && { Cookie: cookie }), ...extra };
  if (body !== undefined && !(body instanceof Uint8Array)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  return fetch(url, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(30000) });
};
const status = async (response, expected, label) => {
  const result = { stage, status: response.status, expected };
  report.checks.push(result);
  if (response.status !== expected) {
    const body = await response.clone().json().catch(() => null);
    if (/^[A-Z0-9_]{1,80}$/.test(body?.error?.code ?? "")) result.code = body.error.code;
    throw Error(label);
  }
  return response;
};
const json = async (path, method, body, cookie, expected = 200) =>
  (await status(await request(path, method, body, cookie), expected, stage)).json();
const cookieOf = (response) => {
  const value = response.headers.getSetCookie().find((item) => item.startsWith("punctum_")) ?? "";
  check(["Secure", "HttpOnly", "SameSite=Strict"].every((flag) => value.includes(flag)), "cookie flags");
  return value.split(";", 1)[0];
};

async function browserChecks(clientCookie, galleryId) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const addSession = async (context, cookie) => {
    const split = cookie.indexOf("=");
    await context.addCookies([{ name: cookie.slice(0, split), value: cookie.slice(split + 1),
      url: origin, secure: true, httpOnly: true, sameSite: "Strict" }]);
  };
  try {
    report.browser = [];
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 920 }]) {
      const context = await browser.newContext({ viewport });
      await addSession(context, adminCookie);
      const page = await context.newPage();
      let errors = 0;
      page.on("pageerror", () => errors++);
      for (const path of ["/", "/portfolio", "/admin/studio"]) {
        stage = "browser-" + path;
        check((await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 30000 }))?.status() === 200, "browser navigation");
        await page.locator("h1").first().waitFor({ timeout: 15000 });
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "browser overflow");
      }
      check(errors === 0, "browser runtime errors");
      report.browser.push({ width: viewport.width, errors, studio: true });
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await addSession(context, clientCookie);
    const page = await context.newPage();
    stage = "private-client-browser";
    check((await page.goto(origin + "/albuns/" + galleryId, { waitUntil: "domcontentloaded", timeout: 30000 }))?.status() === 200, "private client browser");
    await context.close();
  } finally { await browser.close(); }
}

async function main() {
  persist();
  const login = await status(await request("/admin/api/session", "POST", {
    email: process.env.SOURCE_ADMIN_EMAIL, password: process.env.SOURCE_ADMIN_PASSWORD,
  }), 200, "real legacy login");
  adminCookie = cookieOf(login);
  stage = "public-fixture-create";
  const { album } = await json("/admin/api/albums", "POST", { title: "Punctum QA " + marker }, adminCookie, 201);
  fixture.albums.push({ id: album.id, title: "Punctum QA " + marker }); persist();
  stage = "csrf-negative";
  await status(await request("/admin/api/albums/" + album.id, "PATCH", { title: "Punctum QA " + marker }, adminCookie,
    { Origin: "https://unauthorized.example" }), 403, "cross-origin mutation denied");
  stage = "production-20MB-public-limit";
  const tooLarge = await status(await request("/admin/api/uploads/intents", "POST", { albumId: album.id, filename: "limit.png",
    mimeType: "image/png", sizeBytes: 20_000_001 }, adminCookie), 400, "public upload limit");
  check((await tooLarge.json()).error?.code === "FILE_TOO_LARGE", "public 20000000-byte limit");
  stage = "public-upload";
  const upload = await json("/admin/api/uploads/intents", "POST", { albumId: album.id, filename: "synthetic.png",
    mimeType: "image/png", sizeBytes: fixturePng.length }, adminCookie, 201);
  fixture.images.push({ id: upload.imageId, parentId: album.id, private: false,
    key: `originals/${album.id}/${upload.imageId}.png`, sha256: fixtureSha256 }); persist();
  await status(await request(upload.uploadUrl, "PUT", fixturePng, adminCookie, { "Content-Type": "image/png" }), 200, "public original upload");
  await json(`/admin/api/uploads/${upload.intentId}/complete`, "POST", {}, adminCookie);
  await json(`/admin/api/albums/${album.id}/cover`, "POST", { imageId: upload.imageId }, adminCookie);
  await json(`/admin/api/albums/${album.id}/publish`, "POST", {}, adminCookie);
  for (const mime of ["image/webp", "image/jpeg"]) {
    const response = await status(await request(`/media/${upload.imageId}/card`, "GET", undefined, undefined, { Accept: mime }), 200, "Sharp derivative");
    check(response.headers.get("content-type")?.startsWith(mime), "Sharp format negotiation");
    check((await response.arrayBuffer()).byteLength > 8, "Sharp image body");
  }
  stage = "private-clients-create";
  const clients = [];
  for (const suffix of ["a", "b"]) {
    const email = `punctum-${marker}-${suffix}@example.test`;
    const created = await json("/admin/api/clientes", "POST", { name: "Punctum QA " + marker, email }, adminCookie, 201);
    fixture.clients.push({ id: created.client.id, email, name: "Punctum QA " + marker }); persist();
    if (suffix === "a") await status(await request("/admin/api/clientes", "POST", { name: "Punctum QA " + marker, email }, adminCookie), 409, "duplicate client rejected");
    const temporary = cookieOf(await status(await request("/api/client/session", "POST", { email, password: created.temporaryPassword }), 200, "temporary client login"));
    const changed = await status(await request("/api/client/password", "POST", { password: "Punctum QA " + marker + " secure 123!" }, temporary), 200, "first password rotation");
    clients.push({ id: created.client.id, cookie: cookieOf(changed) });
  }
  stage = "private-gallery-create";
  const { gallery } = await json("/admin/api/albuns-privados", "POST", { clientId: clients[0].id, title: "Punctum QA " + marker, theme: "warm" }, adminCookie, 201);
  fixture.galleries.push({ id: gallery.id, clientId: clients[0].id, title: "Punctum QA " + marker }); persist();
  const galleryPath = "/admin/api/albuns-privados/" + gallery.id;
  stage = "production-20MB-private-limit";
  await status(await request(galleryPath + "/uploads/intents", "POST", { filename: "limit.png", mimeType: "image/png",
    sizeBytes: 20_000_001, sha256: fixtureSha256 }, adminCookie), 413, "production 20000000-byte private contract");
  stage = "private-upload-invalid-and-retry";
  const intent = await json(galleryPath + "/uploads/intents", "POST", { filename: "synthetic.png", mimeType: "image/png",
    sizeBytes: fixturePng.length, sha256: fixtureSha256 }, adminCookie, 201);
  fixture.images.push({ id: intent.imageId, parentId: gallery.id, private: true,
    key: `client-galleries/${gallery.id}/${intent.imageId}.png`, sha256: fixtureSha256 }); persist();
  const put = (body) => request(intent.uploadUrl, "PUT", body, adminCookie, { ...intent.requiredHeaders, "Content-Length": String(body.length) });
  stage = "interrupted-private-upload";
  const controller = new AbortController();
  const interrupted = new ReadableStream({ start(stream) { stream.enqueue(fixturePng.subarray(0, 8)); } });
  const timer = setTimeout(() => controller.abort(), 500);
  let aborted = false;
  try {
    const target = new URL(intent.uploadUrl, origin);
    check(target.origin === origin, "unexpected interrupted upload origin");
    const response = await fetch(target, { method: "PUT", body: interrupted, duplex: "half", redirect: "manual",
      headers: { Origin: origin, Cookie: adminCookie, ...intent.requiredHeaders, "Content-Length": String(fixturePng.length) }, signal: controller.signal });
    await response.body?.cancel();
  } catch (error) { aborted = error.name === "AbortError"; }
  finally { clearTimeout(timer); }
  check(aborted, "controlled upload interruption");
  await new Promise((resolve) => setTimeout(resolve, 500));
  stage = "private-upload-invalid-and-retry";
  await status(await put(Buffer.alloc(fixturePng.length)), 400, "invalid bytes rejected");
  await status(await put(fixturePng), 200, "private upload retry");
  await json(galleryPath + "/uploads/" + intent.intentId + "/complete", "POST", {}, adminCookie);
  await json(galleryPath + "/cover", "PUT", { imageId: intent.imageId }, adminCookie);
  await json(galleryPath + "/publish", "POST", {}, adminCookie);
  const clientPath = "/api/client/galleries/" + gallery.id;
  stage = "private-owner-and-cross-tenant";
  await json(clientPath, "GET", undefined, clients[0].cookie);
  await status(await request(clientPath, "GET", undefined, clients[1].cookie), 404, "cross-tenant gallery denied");
  await status(await request("/admin/api/me", "GET", undefined, clients[0].cookie), 403, "client cannot become administrator");
  const photo = clientPath + "/images/" + intent.imageId;
  await status(await request(photo + "/download", "GET", undefined, clients[0].cookie), 403, "download permission required");
  await json(galleryPath, "PATCH", { allowDownloads: true }, adminCookie);
  const original = await status(await request(photo + "/download", "GET", undefined, clients[0].cookie), 200, "authorized original download");
  check(createHash("sha256").update(Buffer.from(await original.arrayBuffer())).digest("hex") === fixtureSha256, "original download digest");
  await status(await request(photo + "/download", "GET", undefined, clients[1].cookie), 404, "cross-tenant original denied");
  await browserChecks(clients[0].cookie, gallery.id);
  stage = "controlled-contact";
  const inquiry = await json("/api/public/inquiries", "POST", { name: "Punctum QA " + marker,
    email: `punctum-${marker}@example.test`, message: "Temporary managed acceptance fixture." }, undefined, 201);
  fixture.inquiries.push({ id: inquiry.inquiryId, name: "Punctum QA " + marker, email: `punctum-${marker}@example.test` }); persist();
  stage = "client-logout";
  const loggedOut = await status(await request("/api/client/session", "DELETE", undefined, clients[0].cookie), 200, "client logout");
  check(/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(loggedOut.headers.get("set-cookie") ?? ""), "client cookie cleared");
  report.status = "MANAGED_PRODUCTION_HTTP_ACCEPTANCE_VERIFIED";
}

try { await main(); }
catch (error) { report.status = "MANAGED_HTTP_NOT_VERIFIED"; report.failure = { stage, kind: error.name }; process.exitCode = 1; }
finally {
  persist();
  if (adminCookie) {
    for (const { id } of fixture.galleries) await request("/admin/api/albuns-privados/" + id + "/archive", "POST", {}, adminCookie).catch(() => {});
    for (const { id } of fixture.clients) await request("/admin/api/clientes/" + id, "PATCH", { disabled: true }, adminCookie).catch(() => {});
    for (const { id } of fixture.albums) await request("/admin/api/albums/" + id + "/archive", "POST", {}, adminCookie).catch(() => {});
    await request("/admin/api/session", "DELETE", undefined, adminCookie).catch(() => {});
  }
  writeFileSync(join(output, "http.json"), JSON.stringify(report), { mode: 0o600 });
  console.log(JSON.stringify(report));
}
