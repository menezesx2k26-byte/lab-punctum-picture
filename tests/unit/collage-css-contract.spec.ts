/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import css from "../../app/collage-home.css?raw";

describe("mobile collage layout regressions", () => {
  it("overrides the legacy hidden About link at narrow phone widths", () => {
    expect(css).toMatch(/\.site-nav a\[href=["']\/#sobre["']\]\s*\{\s*display:\s*flex\s*;/);
  });
  it("keeps actual cover image ratio without forcing crop in paper plates", () => {
    const block = css.match(/\.collage-photo-frame img\s*\{([^}]+)\}/);
    expect(block?.[1]).toBeDefined();
    expect(block?.[1]).toMatch(/object-fit:\s*contain\s*;/);
    expect(block?.[1]).not.toMatch(/aspect-ratio:\s*4\s*\/\s*5/);
  });
});
