"use client";

import Image from "next/image";
import { useSceneProgress } from "../../components/visual/useSceneProgress";
import { refreshAboutCopy } from "../../lib/editorial-refresh";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { EditorialConfig, HomeSectionConfig } from "../../../shared/config";
import { EditorialText } from "../../components/EditorialText";
import { homeSectionAttributes } from "./section-attributes";

export function HomeAboutSection({
  copy: configuredCopy,
  section,
}: {
  copy: EditorialConfig["home"]["about"];
  section: HomeSectionConfig;
}) {
  const variant = section.variant;
  const copy = refreshAboutCopy(configuredCopy);
  const scene = useSceneProgress();

  if (variant === "centered") {
    return (
      <section
        ref={scene}
        id="sobre"
        className="section manifesto manifesto-centered"
        aria-labelledby="sobre-title"
        {...homeSectionAttributes(section)}
      >
        <div className="section-inner manifesto-centered-wrap">
          <div className="manifesto-centered-image">
            <Image
              src="/photos/p001.jpg"
              alt="Maria Helena fotografando com uma câmera"
              width={600}
              height={800}
              sizes="(max-width: 700px) 80vw, 360px"
            />
            <span aria-hidden="true" className="manifesto-caption-tag">{copy.imageNote}</span>
          </div>
          <div className="manifesto-centered-text">
            <p className="eyebrow">{copy.eyebrow}</p>
            <blockquote id="sobre-title">
              <EditorialText text={copy.quote} />
            </blockquote>
            <p className="manifesto-body">{copy.body}</p>
            <Link className="text-link light-link" href="/arquivo">
              {copy.cta} <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (variant === "editorial") {
    return (
      <section
        ref={scene}
        id="sobre"
        className="section manifesto manifesto-editorial"
        aria-labelledby="sobre-title"
        {...homeSectionAttributes(section)}
      >
        <div className="section-inner manifesto-editorial-grid">
          <div className="manifesto-editorial-lead">
            <p className="eyebrow">{copy.eyebrow}</p>
            <blockquote id="sobre-title" className="manifesto-pullquote">
              <EditorialText text={copy.quote} />
            </blockquote>
            <div className="manifesto-editorial-bio">
              <p>{copy.body}</p>
              <div className="manifesto-region-pill">
                <span>Atuação: Joinville · Curitiba · Região Sul</span>
              </div>
              <Link className="text-link light-link" href="/arquivo">
                {copy.cta} <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
          <div className="manifesto-image manifesto-editorial-image reveal">
            <span className="collage-portrait-edition" aria-hidden="true">MARIA HELENA</span>
            <Image
              src="/photos/p001.jpg"
              alt="Maria Helena fotografando com uma câmera"
              width={1024}
              height={1536}
              sizes="(max-width: 900px) 100vw, 45vw"
            />
            <div className="collage-portrait-detail" aria-hidden="true">
              <Image
                src="/photos/p001.jpg"
                alt=""
                width={360}
                height={420}
                sizes="(max-width: 900px) 35vw, 190px"
              />
            </div>
            <span aria-hidden="true">{copy.imageNote}</span>
          </div>
        </div>
      </section>
    );
  }

  if (variant === "side-portrait") {
    return (
      <section
        ref={scene}
        id="sobre"
        className="section manifesto manifesto-side"
        aria-labelledby="sobre-title"
        {...homeSectionAttributes(section)}
      >
        <div className="section-inner manifesto-side-grid">
          <div className="manifesto-image manifesto-side-image reveal">
            <Image
              src="/photos/p001.jpg"
              alt="Maria Helena fotografando com uma câmera"
              width={800}
              height={1200}
              sizes="(max-width: 900px) 100vw, 32vw"
            />
            <span aria-hidden="true">{copy.imageNote}</span>
          </div>
          <div className="manifesto-side-content reveal">
            <p className="eyebrow">{copy.eyebrow}</p>
            <blockquote id="sobre-title">
              <EditorialText text={copy.quote} />
            </blockquote>
            <p className="manifesto-body">{copy.body}</p>
            <div className="manifesto-tags-list">
              <span className="manifesto-tag">Fotografia documental e autoral</span>
              <span className="manifesto-tag">Curitiba & Joinville</span>
              <span className="manifesto-tag">Acervo vivo</span>
            </div>
            <Link className="text-link light-link" href="/arquivo">
              {copy.cta} <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Default: portrait
  return (
    <section
      ref={scene}
      id="sobre"
      className="section manifesto manifesto-portrait"
      aria-labelledby="sobre-title"
      {...homeSectionAttributes(section)}
    >
      <div className="section-inner manifesto-grid">
        <div className="manifesto-image reveal" data-cursor="examine">
          <Image
            src="/photos/p001.jpg"
            alt="Maria Helena fotografando com uma câmera"
            width={1024}
            height={1536}
            sizes="(max-width: 900px) 100vw, 42vw"
          />
          <span>{copy.imageNote}</span>
        </div>
        <div className="reveal manifesto-copy-block">
          <p className="eyebrow">{copy.eyebrow}</p>
          <blockquote id="sobre-title">
            <EditorialText text={copy.quote} />
          </blockquote>
          <p>{copy.body}</p>
          <div className="manifesto-location-line">
            <span>Joinville · Curitiba · São Bento do Sul · Campo Alegre · Rio Negrinho</span>
          </div>
          <Link className="text-link light-link" href="/arquivo" data-cursor="open">
            {copy.cta} <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
