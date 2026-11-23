/* eslint-disable @next/next/no-img-element -- Private media must use authenticated Worker endpoints, without the public image optimizer. */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  ClientGallery,
  ClientGalleryLayout,
} from "../../../shared/client-galleries";
import { ClientHeader } from "./ClientHeader";
import { privateApi, errorMessage } from "./api";
import { galleryHref, privateImageUrl } from "./routes";

const LAYOUT_LABELS: Record<ClientGalleryLayout, string> = {
  classico: "Clássico",
  editorial: "Editorial",
  colagem: "Colagem",
  mosaico: "Mosaico",
  cinema: "Cinema",
};

export function ClientLibrary() {
  const [galleries, setGalleries] = useState<ClientGallery[]>([]);
  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      privateApi<{ galleries: ClientGallery[] }>("/api/client/galleries"),
      privateApi<{ client?: { name?: string } }>("/api/client/me").catch(
        () => ({ client: undefined }),
      ),
    ])
      .then(([galleriesData, meData]) => {
        if (!active) return;
        setGalleries(galleriesData.galleries);
        if (meData.client?.name) setClientName(meData.client.name);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const firstName = clientName.trim().split(/\s+/)[0] ?? "";
  return (
    <>
      <ClientHeader />
      <main className="pa-library">
        <p className="pa-eyebrow">
          {firstName
            ? `Olá, ${firstName} · Sua coleção particular`
            : "Sua coleção particular"}
        </p>
        <h1>
          Memórias para
          <br />
          <em>ficar perto.</em>
        </h1>
        <div className="pa-section-heading">
          <span>Meus álbuns</span>
          <span>{galleries.length.toString().padStart(2, "0")}</span>
        </div>
        {loading && (
          <div className="pa-skeleton-grid" role="status" aria-label="Preparando os seus álbuns">
            {[0, 1, 2].map((slot) => (
              <div className="pa-skeleton-card" key={slot} aria-hidden="true">
                <div className="pa-skeleton-media" />
                <div className="pa-skeleton-line" />
                <div className="pa-skeleton-line short" />
              </div>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="pa-error">
            {error}
          </p>
        )}
        {!loading && !error && galleries.length === 0 && (
          <div className="pa-empty">
            <h2>Suas fotografias chegam em breve.</h2>
            <p>
              Quando o estúdio publicar um álbum para você, ele aparecerá aqui.
            </p>
          </div>
        )}
        <div className="pa-album-grid">
          {galleries.map((g, index) => {
            const layoutLabel =
              LAYOUT_LABELS[(g.layoutPreset ?? "classico") as ClientGalleryLayout] ??
              "Clássico";
            const photoCount = g.readyImageCount ?? 0;
            const favCount = g.favoriteCount ?? 0;
            return (
              <Link
                className="pa-album-card"
                href={galleryHref(g.id)}
                prefetch={false}
                key={g.id}
              >
                {g.coverImageId ? (
                  <img
                    src={privateImageUrl(g.id, g.coverImageId, "gallery")}
                    alt={"Capa de " + g.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="pa-album-placeholder" aria-hidden="true">
                    Punctum Picture
                  </div>
                )}
                <div>
                  <span className="pa-eyebrow">
                    {String(index + 1).padStart(2, "0")} / {layoutLabel}
                  </span>
                  <h2>{g.title}</h2>
                  <p className="pa-card-meta">
                    <span>
                      {photoCount} {photoCount === 1 ? "foto" : "fotos"}
                    </span>
                    {favCount > 0 && <span>· {favCount} favoritas</span>}
                    <span>
                      · {g.allowDownloads ? "Download liberado" : "Somente visualização"}
                    </span>
                  </p>
                  <span aria-hidden="true">Explorar álbum ↗</span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
