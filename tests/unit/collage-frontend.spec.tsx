import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeaturedStories } from "../../app/components/FeaturedStories";
import type { PublicAlbumSummary } from "../../shared/public-content";

function album(overrides: Partial<PublicAlbumSummary> = {}): PublicAlbumSummary {
  return {
    id: "album-1", slug: "ensaio-teste", title: "Ensaio de Maria",
    subtitle: null, description: null, location: null, shootDate: null,
    featured: true, publishedAt: null, seoTitle: null, seoDescription: null,
    coverImageId: "photo-1", coverUrl: null, ogImageUrl: null, categories: [],
    ...overrides,
  };
}

describe("collage featured photography", () => {
  it("renders nothing for an empty portfolio", () => {
    expect(renderToStaticMarkup(createElement(FeaturedStories, { albums: [], variant: "collage" }))).toBe("");
  });
  it("uses the real managed photo and album link without an invented CTA", () => {
    const html = renderToStaticMarkup(createElement(FeaturedStories, { albums: [album()], variant: "collage" }));
    expect(html).toContain('href="/ensaios/ensaio-teste"');
    expect(html).toContain("/media/photo-1/gallery");
    expect(html).toContain("Capa do ensaio Ensaio de Maria");
    expect(html).toContain("<h3>Ensaio de Maria</h3>");
    expect(html).not.toContain("Projeto ficticio");
  });
  it("offers a legible editorial fallback for albums without a cover", () => {
    const html = renderToStaticMarkup(createElement(FeaturedStories, {
      albums: [album({ coverImageId: null, coverUrl: null })], variant: "collage",
    }));
    expect(html).toContain('href="/ensaios/ensaio-teste"');
    expect(html).toContain('class="collage-empty-artwork"');
    expect(html).not.toContain('alt="Capa do ensaio');
  });
  it("retains the visitor's optional modes and distinct links", () => {
    const html = renderToStaticMarkup(createElement(FeaturedStories, {
      albums: [album(), album({ id: "album-2", slug: "segundo-ensaio", title: "Segundo ensaio" })], variant: "collage",
    }));
    expect(html).toContain('href="/ensaios/ensaio-teste"');
    expect(html).toContain('href="/ensaios/segundo-ensaio"');
    expect(html).toContain("Percorrer");
    expect(html).toContain("Grade");
    expect(html).toContain("Composição");
  });
  it("lays out the real albums as an editorial contact sheet with issue markers", () => {
    const html = renderToStaticMarkup(createElement(FeaturedStories, {
      albums: [album(), album({ id: "album-2", slug: "segundo-ensaio", title: "Segundo ensaio" })],
      variant: "collage",
    }));
    expect(html).toContain('class="collage-editorial-masthead"');
    expect(html).toContain("PUNCTUM / SELEÇÃO");
    expect(html).toContain("02 ENSAIOS");
    expect(html).toContain('class="collage-plate-number"');
    expect(html).toContain("01 / 02");
    expect(html).toContain("02 / 02");
    expect(html).toContain('class="collage-paper-annotation"');
  });
});
