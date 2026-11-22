import { LensHero } from "../../components/visual/LensHero";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { EditorialConfig, HomeSectionConfig } from "../../../shared/config";
import type { CarouselImage } from "../../lib/portfolio";
import { resolveConfiguredHeroVisual } from "../../lib/public-visuals";
import { homeSectionAttributes } from "./section-attributes";

export function HomeHeroSection({
  copy,
  section,
  images = [],
  mediaAudience,
}: {
  copy: EditorialConfig["home"]["hero"];
  section: HomeSectionConfig;
  images?: readonly CarouselImage[];
  mediaAudience?: "public" | "admin";
}) {
  const hero = resolveConfiguredHeroVisual(
    section.type === "hero" ? section.heroMedia : null,
    section.appearance.backgroundImageId,
    images,
    mediaAudience,
  );
  const counterpoint = images.find(
    (image) => image.albumSlug && image.src !== hero.src,
  );
  const variant = section.variant;

  if (variant === "cinematic") {
    // The lens has an approved opening photograph; the legacy portrait fallback
    // belongs to other hero variants. Explicit Studio selections still win.
    const lensHero = !section.heroMedia && !section.appearance.backgroundImageId
      ? {src:"/photos/p002.jpg", alt:"Vela acesa iluminando uma mão em uma cena escura", width:1080, height:1440}
      : hero;
    return <LensHero hero={lensHero} copy={copy} section={section} />;
  }

  if (variant === "fullscreen") {
    return (
      <section
        className="hero hero-fullscreen"
        aria-labelledby="hero-title"
        {...homeSectionAttributes(section)}
      >
        <div className="hero-fullscreen-bg" aria-hidden="true">
          <Image
            src={hero.src}
            alt={hero.alt}
            fill
            priority
            unoptimized
            className="hero-fullscreen-image"
            sizes="100vw"
          />
          <div className="hero-fullscreen-scrim" />
        </div>
        <div className="hero-fullscreen-content">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 id="hero-title" className="hero-fullscreen-title">
            <span>{copy.title}</span>
            <em>{copy.accent}</em>
          </h1>
          <p className="hero-description hero-fullscreen-description">
            {copy.body}
          </p>
          <div className="hero-links">
            <Link className="text-link" href="/portfolio">
              {copy.primaryCta}
              <ArrowDownRight size={18} />
            </Link>
            <Link className="quiet-link" href="/arquivo">
              {copy.secondaryCta}
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
        <div className="hero-colophon hero-fullscreen-colophon" aria-hidden="true">
          <span>Maria Helena · Fotografia Autoral</span>
          <span>Joinville · Curitiba · Luz Natural</span>
        </div>
      </section>
    );
  }

  if (variant === "editorial") {
    return (
      <section
        className="hero hero-editorial"
        aria-labelledby="hero-title"
        {...homeSectionAttributes(section)}
      >
        <div className="hero-editorial-header">
          <div className="hero-editorial-meta">
            <p className="eyebrow">{copy.eyebrow}</p>
            <span className="hero-plate-badge">[PLACA 01 — ACERVO VIVO]</span>
          </div>
          <h1 id="hero-title" className="hero-editorial-title">
            <span>{copy.title}</span>
            <em>{copy.accent}</em>
          </h1>
        </div>
        <div className="hero-editorial-body">
          <figure className="hero-editorial-plate">
            <Image
              src={hero.src}
              alt={hero.alt}
              width={hero.width}
              height={hero.height}
              priority
              unoptimized
              sizes="(max-width: 900px) 100vw, 60vw"
            />
            <figcaption>
              <span>Maria Helena</span>
              <span>Punctum Picture — ensaios e séries documentais</span>
            </figcaption>
          </figure>
          <aside className="hero-editorial-aside">
            <p className="hero-description">{copy.body}</p>
            <div className="hero-links">
              <Link className="text-link" href="/portfolio">
                {copy.primaryCta}
                <ArrowDownRight size={18} />
              </Link>
              <Link className="quiet-link" href="/arquivo">
                {copy.secondaryCta}
                <ArrowUpRight size={15} />
              </Link>
            </div>
            {counterpoint ? (
              <Link
                className="hero-counterpoint hero-editorial-counterpoint"
                href={`/ensaios/${counterpoint.albumSlug}`}
              >
                <Image
                  src={counterpoint.src}
                  alt={counterpoint.alt}
                  width={300}
                  height={400}
                  unoptimized
                  sizes="20vw"
                />
                <span>
                  <small>Do acervo</small>
                  {counterpoint.albumTitle}
                  <ArrowUpRight size={14} />
                </span>
              </Link>
            ) : null}
          </aside>
        </div>
        <div className="hero-colophon" aria-hidden="true">
          <span>Presença. Gesto. Movimento.</span>
          <span>Um olhar, muitas histórias ↓</span>
        </div>
      </section>
    );
  }

  if (variant === "split") {
    return (
      <section
        className="hero hero-split"
        aria-labelledby="hero-title"
        {...homeSectionAttributes(section)}
      >
        <div className="hero-split-copy">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 id="hero-title">
            <span>{copy.title}</span>
            <em>{copy.accent}</em>
          </h1>
          <p className="hero-description">{copy.body}</p>
          <div className="hero-links">
            <Link className="text-link" href="/portfolio">
              {copy.primaryCta}
              <ArrowDownRight size={18} />
            </Link>
            <Link className="quiet-link" href="/arquivo">
              {copy.secondaryCta}
              <ArrowUpRight size={15} />
            </Link>
          </div>
          {counterpoint ? (
            <Link
              className="hero-counterpoint"
              href={`/ensaios/${counterpoint.albumSlug}`}
            >
              <Image
                src={counterpoint.src}
                alt={counterpoint.alt}
                width={300}
                height={400}
                unoptimized
                sizes="18vw"
              />
              <span>
                <small>Do acervo</small>
                {counterpoint.albumTitle}
                <ArrowUpRight size={14} />
              </span>
            </Link>
          ) : null}
        </div>
        <div className="hero-split-visual">
          <figure className="hero-image hero-split-image">
            <Image
              src={hero.src}
              alt={hero.alt}
              width={hero.width}
              height={hero.height}
              priority
              unoptimized
              sizes="(max-width: 700px) 100vw, 50vw"
            />
            <figcaption>
              <span>Maria Helena</span>
              <span>Punctum Picture — fotografia autoral</span>
            </figcaption>
          </figure>
        </div>
        <div className="hero-colophon" aria-hidden="true">
          <span>Presença. Gesto. Movimento.</span>
          <span>Um olhar, muitas histórias ↓</span>
        </div>
      </section>
    );
  }

  // Default: cinematic
  return (
    <section
      className="hero hero-cinematic"
      aria-labelledby="hero-title"
      {...homeSectionAttributes(section)}
    >
      <div className="hero-ambient-glow" aria-hidden="true" />
      <div className="hero-copy">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 id="hero-title">
          <span>{copy.title}</span>
          <em>{copy.accent}</em>
        </h1>
        <p className="hero-description">{copy.body}</p>
        <div className="hero-links">
          <Link className="text-link" href="/portfolio">
            {copy.primaryCta}
            <ArrowDownRight size={18} />
          </Link>
          <Link className="quiet-link" href="/arquivo">
            {copy.secondaryCta}
            <ArrowUpRight size={15} />
          </Link>
        </div>
        {counterpoint ? (
          <Link
            className="hero-counterpoint"
            href={`/ensaios/${counterpoint.albumSlug}`}
          >
            <Image
              src={counterpoint.src}
              alt={counterpoint.alt}
              width={300}
              height={400}
              unoptimized
              sizes="18vw"
            />
            <span>
              <small>Do acervo</small>
              {counterpoint.albumTitle}
              <ArrowUpRight size={14} />
            </span>
          </Link>
        ) : null}
      </div>
      <figure className="hero-image">
        <Image
          src={hero.src}
          alt={hero.alt}
          width={hero.width}
          height={hero.height}
          priority
          unoptimized
          sizes="(max-width: 700px) 100vw, 52vw"
        />
        <div className="hero-vignette" aria-hidden="true" />
        <figcaption>
          <span>Maria Helena</span>
          <span>Punctum Picture — fotografia autoral</span>
        </figcaption>
      </figure>
      <div className="hero-colophon" aria-hidden="true">
        <span>Presença · Gesto · Movimento</span>
        <span>Joinville · Curitiba · Luz Natural</span>
        <span>Um olhar, muitas histórias ↓</span>
      </div>
    </section>
  );
}
