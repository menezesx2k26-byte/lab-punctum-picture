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
});
