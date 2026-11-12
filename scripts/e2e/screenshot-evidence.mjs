/**
 * Capture a screenshot without disguising a test failure as PASS. Full-page
 * capture occasionally times out on slow local Chromium after heavy SSR; a
 * viewport-only fallback is marked explicitly in the browser report. If both
 * captures fail, the E2E fails. This is a local QA utility, not production UI.
 * Chromium DevTools capture is the next fallback, as Playwright's element
 * stability/font readiness machinery can stall on a heavy SSR page despite a
 * responsive browser. It captures only the viewport, never silently claiming
 * full-page coverage. If both DevTools and Playwright fallbacks fail, fail QA.
 */
import { writeFile } from "node:fs/promises";

async function captureChromiumViewport(page, path) {
  const session = await page.context().newCDPSession(page);
  let deadline;
  try {
    const captured = await Promise.race([
      session.send("Page.captureScreenshot", {format:"png",captureBeyondViewport:false}),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("CDP screenshot timed out")), 20_000); }),
    ]);
    if (typeof captured?.data !== "string" || !captured.data) throw new Error("CDP screenshot is empty");
    await writeFile(path, Buffer.from(captured.data, "base64"));
  } finally {
    clearTimeout(deadline);
    await session.detach().catch(() => {});
  }
}

export async function takeEvidenceScreenshot(page, path) {
  try {
    await page.screenshot({ path, fullPage: true, animations: "disabled", timeout: 30_000 });
    return "fullPage";
  } catch (error) {
    if (error?.name !== "TimeoutError") throw error;
    if (typeof page.context === "function") {
      try {
        await captureChromiumViewport(page, path);
        return "cdpViewportFallback";
      } catch {
        // Preserve the existing Playwright fallback, and fail if it also fails.
      }
    }
    await page.screenshot({ path, fullPage: false, animations: "disabled", timeout: 60_000 });
    return "viewportFallback";
  }
}
