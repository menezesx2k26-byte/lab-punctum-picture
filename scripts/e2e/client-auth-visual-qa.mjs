/**
 * Client-auth visual QA for the existing isolated Miniflare E2E browser.
 *
 * This module does not start a server, request credentials or touch remote
 * customer accounts. It borrows the synthetic origin and browser already
 * created by punctum-browser.mjs.
 */
import assert from "node:assert/strict";

const VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

export async function runClientAuthVisualQa({
  browser,
  origin,
  record,
  screenshot,
  auditAccessibility,
}) {
  for (const { width, height } of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));

      const response = await page.goto(origin + "/albuns/entrar", {
        waitUntil: "domcontentloaded",
      });
      assert.equal(response?.status(), 200, "client login must return HTTP 200");
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
          hasPublishedTokens: Boolean(root && getComputedStyle(root).getPropertyValue("--color-background").trim()),
          photoDecorative: photo?.getAttribute("alt") === "",
          logoLabeled: Boolean(logo?.getAttribute("aria-label")),
          actionHeight: buttonBox?.height ?? 0,
          noProviderJargon: !document.querySelector(".pa-auth-main")?.textContent?.includes("Clerk"),
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        };
      });

      assert(metrics.theme, "published theme must appear on auth shell");
      assert(metrics.hasPublishedTokens, "auth shell must expose the theme CSS variables");
      assert(metrics.photoDecorative, "public decorative image must have empty alt");
      assert(metrics.logoLabeled, "site logo link must have an accessible name");
      assert(metrics.actionHeight >= 48, "auth primary action must be at least 48px high");
      assert(metrics.scrollWidth <= metrics.width + 1,
        "horizontal overflow at " + width + "px: " + JSON.stringify(metrics));
      assert(metrics.noProviderJargon, "client page must not expose the auth provider brand");
      assert(metrics.reducedMotion, "reduced motion preference not respected");
      assert.deepEqual(errors, [], "client login JS errors at " + width + "px");

      if (width === 390 || width === 1440) {
        await auditAccessibility(page, "client auth " + width + "px");
        await screenshot(page, "client-auth-" + width + ".png");
      }
      record("client auth responsive " + width +
        "x" + height + ": published tokens, no overflow, accessible primary action");
    } finally {
      await context.close();
    }
  }

  record("client auth uses no real account; Clerk modal and physical screen-reader QA remain separate");
}
