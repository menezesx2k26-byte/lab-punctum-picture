"use client";

import Image from "next/image";
import Link from "next/link";
import { StorySequence } from "./visual/StorySequence";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { PublicAlbumSummary } from "../../shared/public-content";
import { albumArtworkSource } from "../lib/album-artwork";
import { EssayLink } from "./EssayLink";

export function FeaturedStories({
  albums,
  variant = "editorial-grid",
}: {
  albums: PublicAlbumSummary[];
  variant?: "editorial-grid" | "gallery" | "collage";
}) {
  const [mode, setMode] = useState<"projector" | "editorial" | "collage">(
    variant === "collage" ? "collage" : variant === "gallery" ? "editorial" : "projector"
  );

  if (!albums.length) return null;

  return (
    <div className="featured-stories-container">
      {/* Seletor Curatorial de Visualização */}
      <div className="stories-view-bar" role="group" aria-label="Modo de visualização dos ensaios">
        <span className="view-bar-label">Visualização:</span>
        <div className="view-bar-buttons">
          <button
            type="button"
            onClick={() => setMode("projector")}
            className={`view-switch-btn ${mode === "projector" ? "is-active" : ""}`}
            aria-pressed={mode === "projector"}
          >
            <span>Percorrer</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("editorial")}
            className={`view-switch-btn ${mode === "editorial" ? "is-active" : ""}`}
            aria-pressed={mode === "editorial"}
          >
            <span>Grade</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("collage")}
            className={`view-switch-btn ${mode === "collage" ? "is-active" : ""}`}
            aria-pressed={mode === "collage"}
          >
            <span>Composição</span>
          </button>
        </div>
      </div>

      {/* MODO 1: PASSAGEM DE LUZ (Índice Editorial com Fundo Projetado) */}
      {mode === "projector" && <StorySequence albums={albums} />}

      {/* MODO 2: GRADE EDITORIAL */}
      {mode === "editorial" && (
        <div className="editorial-stories-layout">
          {albums[0] ? (
            <Link
              href={`/ensaios/${albums[0].slug}`}
              className="editorial-lead-story"
              data-cursor="open"
            >
              <div className="editorial-lead-artwork">
                {albumArtworkSource(albums[0]) ? (
                  <Image
                    src={albumArtworkSource(albums[0])!}
                    alt={`Capa do ensaio ${albums[0].title}`}
                    width={1800}
                    height={1100}
                    unoptimized
                    priority
                    sizes="(max-width: 900px) 100vw, 85vw"
                    className="editorial-lead-image"
                  />
                ) : null}
                <div className="editorial-lead-badge">
                  <span>{albums[0].title}</span>
                </div>
              </div>
              <div className="editorial-lead-info">
                <div className="editorial-lead-kicker">
                  <span className="editorial-lead-category">
                    {albums[0].categories.map((c) => c.name).join(" · ")}
                  </span>
                  {albums[0].location?.trim() ? (
                    <span className="editorial-lead-loc">{albums[0].location.trim()}</span>
                  ) : null}
                </div>
                <h3 className="editorial-lead-title">{albums[0].title}</h3>
                {albums[0].subtitle ? (
                  <p className="editorial-lead-sub">{albums[0].subtitle}</p>
                ) : null}
                <span className="text-link editorial-lead-cta">
                  Abrir ensaio completo <ArrowUpRight size={16} />
                </span>
              </div>
            </Link>
          ) : null}

          {albums.length > 1 ? (
            <div className="editorial-secondary-grid">
              {albums.slice(1).map((album, index) => (
                <EssayLink
                  key={album.id}
                  album={album}
                  index={index + 1}
                  heading="h3"
                />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* MODO 3: PRANCHAS DE COLAGEM TÁTIL */}
      {mode === "collage" && (
        <div className="stories-collage-layout">
          <div className="collage-editorial-masthead" aria-hidden="true">
            <span>PUNCTUM PICTURE / ENSAIOS</span>
            <strong>MARIA<br />HELENA.</strong>
            <small>{String(albums.length).padStart(2, "0")} ENSAIOS / SELEÇÃO</small>
          </div>
          {albums.map((album, index) => {
            const source = albumArtworkSource(album);
            return (
              <Link
                key={album.id}
                href={`/ensaios/${album.slug}`}
                className={`collage-story-plate collage-plate-${index + 1}`}
                data-cursor="open"
              >
                <span className="collage-plate-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")} / {String(albums.length).padStart(2, "0")}
                </span>
                <div className="collage-photo-frame">
                  {index === 0 ? <span className="collage-tape-mark" aria-hidden="true" /> : null}
                  {source ? (
                    <Image
                      src={source}
                      alt={`Capa do ensaio ${album.title}`}
                      width={1200}
                      height={900}
                      unoptimized
                      sizes="(max-width: 700px) 90vw, 36vw"
                    />
                  ) : (
                    <div className="collage-empty-artwork" aria-hidden="true">
                      <span>Punctum Picture</span>
                    </div>
                  )}
                </div>
                <div className="collage-caption">
                  <h3>{album.title}</h3>
                  {album.categories.length ? (
                    <p>{album.categories.map((c) => c.name).join(" · ")}</p>
                  ) : null}
                  {album.location?.trim() ? (
                    <small className="collage-caption-location">{album.location.trim()}</small>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
