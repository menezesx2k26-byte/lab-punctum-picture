import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const css = readFileSync(fileURLToPath(new URL("../app/collage-home.css", import.meta.url)), "utf8");

describe("Collage mobile CSS contract", () => {
  it("restores the About link hidden by the legacy mobile stylesheet", () => {
    assert.match(css, /\.site-nav a\[href="\/#sobre"\]\s*\{\s*display:\s*flex\s*;/);
  });
  it("does not crop originals into an arbitrary 4:5 card", () => {
    const match = css.match(/\.collage-photo-frame img\s*\{([^}]+)\}/);
    assert.ok(match, "missing collage cover image rule");
    assert.match(match[1], /object-fit:\s*contain\s*;/);
    assert.doesNotMatch(match[1], /aspect-ratio:\s*4\s*\/\s*5/);
  });
  it("defines high-specificity light and dark Studio section surfaces", () => {
    assert.match(css, /\.visual-thesis\[data-section-surface="dark"\]/);
    assert.match(css, /\.manifesto\[data-section-surface="dark"\]/);
    assert.match(css, /\.visual-thesis\[data-section-surface="light"\]/);
    assert.match(css, /\.manifesto\[data-section-surface="light"\]/);
  });
  it("wraps mobile navigation while keeping every link at least 48px square", () => {
    const nav = css.match(/\.site-shell\.immersive-home\[data-theme-preset="colagem-autoral"\] \.site-nav\s*\{([^}]+)\}/s);
    const links = css.match(/\.site-shell\.immersive-home\[data-theme-preset="colagem-autoral"\] \.site-nav a\s*\{([^}]+)\}/s);
    assert.ok(nav, "missing collage navigation rule");
    assert.ok(links, "missing collage navigation link rule");
    assert.match(nav[1], /flex-wrap:\s*wrap\s*;/);
    assert.match(links[1], /min-width:\s*48px\s*;/);
    assert.match(links[1], /min-height:\s*48px\s*;/);
  });
  it("stacks footer links at narrow 320px viewports instead of clipping them", () => {
    assert.match(
      css,
      /@media\s*\(max-width:\s*380px\)\s*\{[\s\S]*?\.site-footer nav\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/,
      "narrow collage footer must have a single flexible column",
    );
  });
  it("composes asymmetric contact-sheet cards while preserving uncropped originals", () => {
    assert.match(css, /\.stories-collage-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    assert.match(css, /\.collage-story-plate:nth-of-type\(2n\)/);
    assert.match(css, /\.collage-editorial-masthead\s*\{/);
    assert.match(css, /\.collage-paper-annotation\s*\{/);
    assert.match(css, /\.collage-photo-frame img\s*\{[^}]*object-fit:\s*contain/s);
  });
  it("adds print textures as noninteractive overlays instead of filtering originals", () => {
    assert.match(css, /\.stories-section::before\s*\{[^}]*pointer-events:\s*none/s);
    assert.match(css, /\.manifesto-editorial-image \.collage-portrait-detail/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  });
  it("places editorial labels over photographs rather than covering album captions", () => {
    const label = css.match(/\.collage-paper-annotation\s*\{([^}]+)\}/);
    assert.ok(label);
    assert.match(label[1], /top:\s*1\.25rem/);
    assert.match(label[1], /bottom:\s*auto/);
    assert.match(
      css,
      /@media \(max-width: 767px\)\s*\{[\s\S]*?\.manifesto-editorial-image \.collage-portrait-detail\s*\{[^}]*left:\s*1\.25rem/s,
      "decorative portrait inset must clear rotation clipping at 360–430px",
    );
  });
});
