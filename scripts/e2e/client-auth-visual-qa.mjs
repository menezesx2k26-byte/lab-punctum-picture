/**
 * Client-auth browser QA runs in its own local synthetic Miniflare Worker.
 * The parent suite intentionally uses CLIENT_AUTH_MODE=access and its
 * /albuns/entrar is intercepted before React; changing that would invalidate
 * existing security assertions. This fixture isolates password-mode UI QA.
 */
import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close(() => resolvePort(port));
    });
  });
}

export function passwordAuthFixtureOptions(v4Options, origin, port) {
  return {
    ...v4Options,
    name: "punctum-auth-visual-synthetic",
    host: "127.0.0.1",
    port,
    d1Databases: { DB: "punctum-auth-visual-d1" },
    r2Buckets: {
      ORIGINALS: "punctum-auth-visual-originals",
      BACKUPS: "punctum-auth-visual-backups",
    },
    bindings: {
      ...v4Options.bindings,
      SITE_ORIGIN: origin,
      PUBLIC_SITE_URL: origin,
      CLIENT_AUTH_MODE: "password",
      CLERK_AUTH_ENABLED: "false",
      PUBLIC_HOME_SNAPSHOT_ENABLED: "false",
      PUBLIC_HOME_CACHE_ENABLED: "false",
    },
  };
}

export async function runClientAuthVisualQa({
  browser,
  v4Options,
  record,
  screenshot,
  auditAccessibility,
}) {
  // This fixture never inherits the Access-mode test's session/database.
  const temporary = await mkdtemp(join(tmpdir(), "punctum-auth-visual-"));
  const port = await freePort();
  const origin = "http://127.0.0.1:" + port;
  let mf;
  try {
    const visualOptions = convertV4MiniflareOptions(
      passwordAuthFixtureOptions(v4Options, origin, port),
    );
    visualOptions.resourcePersistencePath = join(temporary, "storage");
    visualOptions.telemetry = { enabled: false };
    mf = new Miniflare(visualOptions);
    await mf.ready;
    const db = await mf.getD1Database("DB");
    // Match the parent suite's migrations, but populate a separate blank D1.
    for (const path of globSync(resolve("migrations/*.sql")).sort()) {
      const statements = (await readFile(path, "utf8"))
        .split(";").map((sql) => sql.trim()).filter(Boolean);
      for (const statement of statements) await db.prepare(statement).run();
    }
    for (const { width, height } of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: "reduce",
      });
      try {
        await context.route("**/*", (route) => {
          const url = new URL(route.request().url());
          return url.origin === origin || url.protocol === "data:"
            ? route.continue()
            : route.abort("blockedbyclient");
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const response = await page.goto(origin + "/albuns/entrar", {
          waitUntil: "domcontentloaded",
        });
        assert.equal(response?.status(), 200,
          "password-mode client login must return HTTP 200 at " + width + "px");
        await page.getByRole("heading", { level: 1 }).waitFor();
        assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
        await page.getByRole("button", { name: "Abrir meus álbuns" }).waitFor();

        const metrics = await page.evaluate(() => {
          const root = document.querySelector(".pa-auth-shell");
          const photo = document.querySelector(".pa-auth-photo img");
          const button = document.querySelector(".pa-auth-form .pa-primary");
          const logo = document.querySelector(".pa-auth-logo");
          const buttonBox = button?.getBoundingClientRect();
          return {
            width: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            theme: root?.getAttribute("data-theme-palette"),
            hasPublishedTokens: Boolean(root &&
              getComputedStyle(root).getPropertyValue("--color-background").trim()),
            photoDecorative: photo?.getAttribute("alt") === "",
            logoLabeled: Boolean(logo?.getAttribute("aria-label")),
            actionHeight: buttonBox?.height ?? 0,
            noProviderJargon:
              !document.querySelector(".pa-auth-main")?.textContent?.includes("Clerk"),
            reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          };
        });

        assert(metrics.theme, "published theme must appear on auth shell");
        assert(metrics.hasPublishedTokens, "auth shell must expose theme tokens");
        assert(metrics.photoDecorative, "public decorative photo must have empty alt");
        assert(metrics.logoLabeled, "site logo link must have accessible name");
        assert(metrics.actionHeight >= 48, "primary action must be at least 48px");
        assert(metrics.scrollWidth <= metrics.width + 1,
          "horizontal overflow at " + width + "px: " + JSON.stringify(metrics));
        assert(metrics.noProviderJargon, "login must not expose provider brand");
        assert(metrics.reducedMotion, "reduced motion not respected");
        assert.deepEqual(errors, [], "client login JS errors at " + width + "px");

        if (width === 390 || width === 1440) {
          await auditAccessibility(page, "client auth " + width + "px");
          await screenshot(page, "client-auth-" + width + ".png");
        }
        record("client auth visual " + width + "x" + height +
          ": isolated password mode, published tokens, accessible action");
      } finally {
        await context.close();
      }
    }
    record("Access-mode security fixture unchanged; password-mode auth visuals isolated");
  } finally {
    if (mf) await mf.dispose();
    await rm(temporary, { recursive: true, force: true });
  }
}
