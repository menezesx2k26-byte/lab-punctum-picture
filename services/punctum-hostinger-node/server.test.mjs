import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { openQaDatabase } from "./sqlite.mjs";
import sharp from "sharp";
import { takeEvidenceScreenshot } from "../../scripts/e2e/screenshot-evidence.mjs";
import { createQaSnapshot } from "./migration-manifest.mjs";

const service = new URL("./", import.meta.url);

function seed(file) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("seed.mjs", service)), file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

async function openPort() {
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const { port } = reservation.address();
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  return port;
}

test("SQLite binding rolls back every statement after a failed batch", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "punctum-node-db-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "synthetic.sqlite");
  seed(file);
  const db = openQaDatabase(file);
  t.after(() => db.close());
  await assert.rejects(db.batch([
    db.prepare("UPDATE site_settings SET brand_name = ? WHERE id = 1").bind("Rollback fixture"),
    db.prepare("INSERT INTO categories (id) VALUES (?)").bind("incomplete"),
  ]));
  assert.equal(await db.prepare("SELECT brand_name FROM site_settings").first("brand_name"), "Punctum Picture");
});

test("Node serves request-time Punctum HTML, protected Studio and persisted data", { timeout: 300_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "punctum-node-ssr-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "synthetic.sqlite");
  seed(file);

  const port = await openPort();
  const origin = `http://127.0.0.1:${port}`;
  const email = "admin@example.test";
  const password = randomBytes(20).toString("hex");
  const child = spawn(process.execPath, [fileURLToPath(new URL("server.mjs", service))], {
    env: {
      ...process.env,
      PORT: String(port),
      PUNCTUM_QA_ORIGIN: origin,
      PUNCTUM_QA_DB_FILE: file,
      PUNCTUM_QA_ADMIN_EMAIL: email,
      PUNCTUM_QA_ADMIN_PASSWORD_HASH: createHash("sha256").update(password).digest("hex"),
      PUNCTUM_QA_ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  });
  let serverError = "";
  child.stderr.setEncoding("utf8").on("data", value => { serverError += value; });
  const get = (path, init) => fetch(origin + path, { redirect: "manual", ...init });
  let ready = false;
  for (let attempt = 0; attempt < 60 && child.exitCode === null; attempt++) {
    try {
      if ((await get("/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {
      await setTimeout(100);
    }
  }
  assert.ok(ready, serverError);

  for (const path of ["/", "/portfolio", "/arquivo", "/contato"]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /^text\/html/u);
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/u);
    assert.match(response.headers.get("x-robots-tag"), /noindex/u);
    assert.match(await response.text(), /<h1[\s>]/u);
  }
  const seo = await get("/sitemap.xml");
  assert.equal(seo.status, 200);
  assert.match(await seo.text(), /<urlset/u);
  assert.match(await (await get("/robots.txt")).text(), /Disallow: \//u);
  assert.match((await get("/images/hero-maria.webp")).headers.get("content-type"), /^image\/webp/u);

  if (process.env.PUNCTUM_QA_BROWSER === "1") {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    const output = new URL("../../outputs/hostinger-qa-browser/", service);
    await mkdir(output, { recursive: true });
    const report = {
      sourceSha: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
      checkoutDirtyAtRun: spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).stdout.trim().length > 0,
      scope: "local-node-synthetic-and-public-http-comparison",
      managedQa: "NOT_TESTED",
    };
    try {
      for (const [layout, width, height] of [["mobile", 390, 844], ["desktop", 1440, 920]]) {
        for (const [environment, base] of [["synthetic", origin], ["production", "https://punctumpicture.com"]]) {
          const page = await browser.newPage({ viewport: { width, height } });
          const failures = [];
          page.on("pageerror", () => failures.push("pageerror"));
          const requests = [];
          page.on("requestfailed", request => requests.push({ path: new URL(request.url()).pathname, type: request.resourceType(), error: request.failure()?.errorText }));
          const name = `${environment}-${layout}`;
          try {
            const response = await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30_000 });
            await page.locator("h1").first().waitFor({ timeout: 8_000 });
            const screenshotMode = await takeEvidenceScreenshot(page, fileURLToPath(new URL(name + ".png", output)));
            const metrics = await page.evaluate(() => ({
              viewport: innerWidth,
              contentWidth: document.documentElement.scrollWidth,
              stylesheets: document.styleSheets.length,
            }));
            report[name] = { status: response.status(), ...metrics, pageErrors: failures.length, screenshotMode, failedRequests: requests };
            if (environment === "synthetic") {
              assert.equal(response.status(), 200);
              assert.ok(metrics.stylesheets > 0, "the build must serve its stylesheets");
              assert.ok(metrics.contentWidth <= width + 1, "the page must fit the viewport");
              assert.equal(failures.length, 0);
            }
          } catch (error) {
            report[name] = { error: error.name, failedRequests: requests };
            if (environment === "synthetic") throw error;
          } finally {
            await page.close();
          }
        }
      }
    } finally {
      await writeFile(new URL("summary.json", output), JSON.stringify(report, null, 2) + "\n");
      await browser.close();
    }
  }

  const sql = new DatabaseSync(file);
  try {
    const settings = sql.prepare("UPDATE site_settings SET seo_title = ? WHERE id = 1");
    for (const marker of ["Punctum SSR Fixture A", "Punctum SSR Fixture B"]) {
      settings.run(marker);
      const html = await (await get("/")).text();
      assert.ok(html.includes(`<title>${marker}`), "SSR must read the current DB value");
    }

    const studio = await get("/admin/studio");
    assert.equal(studio.status, 303);
    assert.match(studio.headers.get("location"), /\/acesso\?next=/u);
    assert.equal((await get("/studio-preview-internal")).status, 404);
    assert.equal((await get("/albuns/entrar")).status, 404);

    const auth = await get("/admin/api/session", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(auth.status, 200);
    const session = auth.headers.getSetCookie()[0];
    assert.match(session, /HttpOnly/u);
    assert.match(session, /SameSite=Strict/u);
    const cookie = session.split(";", 1)[0];
    assert.equal((await get("/admin/studio", { headers: { cookie } })).status, 200);
    assert.equal((await get("/admin/api/studio", { headers: { cookie } })).status, 200);

    const title = "Synthetic draft for SQLite backup";
    const create = await get("/admin/api/albums", {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    assert.equal(create.status, 201);
    const { album } = await create.json();
    assert.equal(album.status, "draft");

    const adminMutation = (path, payload) => get(path, {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const original = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "navy" },
    }).png().toBuffer();
    const sha256 = createHash("sha256").update(original).digest("hex");
    const intentResult = await adminMutation("/admin/api/uploads/intents", {
      albumId: album.id, filename: "synthetic.png", mimeType: "image/png", sizeBytes: original.length,
    });
    assert.equal(intentResult.status, 201);
    const intent = await intentResult.json();
    const direct = await get(new URL(intent.uploadUrl).pathname, {
      method: "PUT", headers: { origin, cookie, "content-type": "image/png" }, body: original,
    });
    assert.equal(direct.status, 200);
    assert.equal((await adminMutation(`/admin/api/uploads/${intent.intentId}/complete`, {})).status, 200);
    assert.equal((await adminMutation(`/admin/api/albums/${album.id}/cover`, { imageId: intent.imageId })).status, 200);
    assert.equal((await get(`/media/${intent.imageId}/card`)).status, 404);
    assert.equal((await adminMutation(`/admin/api/albums/${album.id}/publish`, {})).status, 200);

    const published = await get(`/ensaios/${album.slug}`);
    assert.equal(published.status, 200);
    assert.ok((await published.text()).includes(title));
    const thumbnail = await get(`/media/${intent.imageId}/card`, { headers: { accept: "image/webp" } });
    assert.equal(thumbnail.status, 200);
    const resized = await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata();
    assert.equal(resized.format, "webp");
    assert.ok(resized.width && resized.height);
    assert.equal((await adminMutation(`/admin/api/albums/${album.id}/archive`, {})).status, 200);
    assert.equal((await get(`/media/${intent.imageId}/card`)).status, 404);

    const contact = await get("/api/public/inquiries", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ name: "QA fixture", email: "contact@example.test", message: "Synthetic message from Node QA." }),
    });
    assert.equal(contact.status, 201);
    const logout = await get("/admin/api/session", { method: "DELETE", headers: { cookie } });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/u);

    const snapshot = join(directory, "restore.sqlite");
    await backup(sql, snapshot);
    const restored = new DatabaseSync(snapshot);
    try {
      assert.equal(restored.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      assert.equal(restored.prepare("PRAGMA foreign_key_check").all().length, 0);
      assert.equal(restored.prepare("SELECT title FROM albums WHERE id = ?").get(album.id).title, title);
      assert.equal(restored.prepare("SELECT COUNT(*) AS count FROM inquiries").get().count, 1);
      const restoredMedia = restored.prepare("SELECT bytes, etag FROM node_qa_media WHERE key = ?").get(intent.objectKey);
      assert.equal(createHash("sha256").update(restoredMedia.bytes).digest("hex"), sha256);
      assert.equal(restoredMedia.etag, sha256);
    } finally {
      restored.close();
    }
    const manifest = await createQaSnapshot(file, join(directory, "manifest-restore.sqlite"));
    assert.equal(manifest.integrity, "ok");
    assert.equal(manifest.tables.inquiries.rows, 1);
    assert.equal(manifest.media.objects, 1);
    if (process.env.PUNCTUM_QA_BROWSER === "1") {
      const output = new URL("../../outputs/hostinger-qa-browser/", service);
      await writeFile(new URL("migration-manifest.json", output), JSON.stringify(manifest, null, 2) + "\n");
    }
  } finally {
    sql.close();
  }
});
