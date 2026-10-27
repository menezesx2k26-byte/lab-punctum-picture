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
    expect(html).toContain("PUNCTUM PICTURE / ENSAIOS");
    expect(html).toContain("MARIA<br/>HELENA.");
    expect(html).toContain("02 ENSAIOS");
    expect(html).toContain('class="collage-plate-number"');
    expect(html).toContain("01 / 02");
    expect(html).toContain("02 / 02");
    expect(html).not.toContain("ESTUDOS DO OLHAR");
    expect(html).not.toContain("ACERVO VIVO");
    expect(html).not.toContain("arquivo<br");
    expect(html).not.toContain("✳");
  });
  it("uses album location only when supplied and reserves tape for a single print", () => {
    const html = renderToStaticMarkup(createElement(FeaturedStories, {
      albums: [
        album({ location: "Joinville" }),
        album({ id: "album-2", slug: "segundo-ensaio", title: "Segundo ensaio", location: null }),
        album({ id: "album-3", slug: "terceiro-ensaio", title: "Terceiro ensaio", location: null }),
      ], variant: "collage",
    }));
    expect(html).toContain("Joinville");
    expect(html).toContain("collage-caption-location");
    expect((html.match(/collage-tape-mark/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain("arquivo autoral");
  });
  it("never invents a location for the editorial grid or emits blank category captions", () => {
    const withPlace = renderToStaticMarkup(createElement(FeaturedStories, {
      albums: [album({ location: "São Bento do Sul" })], variant: "gallery",
    }));
    expect(withPlace).toContain("São Bento do Sul");
    expect(withPlace).not.toContain("Joinville &amp; Curitiba");

    const withoutPlace = renderToStaticMarkup(createElement(FeaturedStories, {
      albums: [album({ location: null })], variant: "gallery",
    }));
    expect(withoutPlace).not.toContain('class="editorial-lead-loc"');

    const collage = renderToStaticMarkup(createElement(FeaturedStories, {
      albums: [album({ categories: [] })], variant: "collage",
    }));
    expect(collage).not.toContain("<p></p>");
  });
});
