"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicArchiveImage } from "../../shared/public-content";

const ARCHIVE_PAGE_SIZE = 24;

type ArchiveViewImage = PublicArchiveImage & {
  number: number;
  src: string;
  fullSrc: string;
  alt: string;
  category: string;
};

export function ArchiveGrid({ images }: { images: PublicArchiveImage[] }) {
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [filter, setFilter] = useState("Tudo");
  const [visibleCount, setVisibleCount] = useState(ARCHIVE_PAGE_SIZE);
  const [selected, setSelected] = useState<string | null>(null);
  const liveImages = useMemo<ArchiveViewImage[]>(
    () =>
      images.map((image, index) => ({
        ...image,
        number: index + 1,
        src: `/media/${image.id}/sheet`,
        fullSrc: image.url,
        alt: image.altText ?? `Fotografia do ensaio ${image.albumTitle}`,
        category:
          image.categories.map((category) => category.name).join(" · ") ||
          "Sem categoria",
      })),
    [images],
  );
  const categories = useMemo(
    () => [
      "Tudo",
      ...Array.from(
        new Set(
          liveImages.flatMap((image) =>
            image.categories.map((category) => category.name),
          ),
        ),
      ),
    ],
    [liveImages],
  );
  const visible = useMemo(
    () =>
      filter === "Tudo"
        ? liveImages
        : liveImages.filter((image) =>
            image.categories.some((category) => category.name === filter),
          ),
    [filter, liveImages],
  );
  const rendered = visible.slice(0, visibleCount);
  const selectedIndex = visible.findIndex((image) => image.id === selected);
  const selectedImage = selectedIndex >= 0 ? visible[selectedIndex] : null;

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!visible.length) return;
      const nextIndex =
        (selectedIndex + direction + visible.length) % visible.length;
      setSelected(visible[nextIndex].id);
    },
    [selectedIndex, visible],
  );

  const isOpen = selectedImage !== null;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  return (
    <>
      <div className="archive-toolbar">
        <p role="status">{visible.length.toString().padStart(3, "0")} fotografias</p>
        <div className="archive-filters" aria-label="Filtrar arquivo">
          {categories.map((category) => (
            <button
              className={filter === category ? "active" : ""}
              key={category}
              type="button"
              onClick={() => {
                setFilter(category);
                setSelected(null);
                setVisibleCount(ARCHIVE_PAGE_SIZE);
              }}
              aria-pressed={filter === category}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="archive-grid">
        {rendered.map((image, index) => (
          <button
            className={`archive-card archive-card-${index % 7}`}
            key={image.id}
            type="button"
            onClick={(event) => { openerRef.current = event.currentTarget; setSelected(image.id); }}
            aria-label={`Abrir fotografia ${image.number}: ${image.alt}`}
          >
            <span className="archive-image">
              <Image
                src={image.src}
                alt=""
                fill
                unoptimized
                loading="lazy"
                sizes="(max-width: 620px) 50vw, (max-width: 1000px) 33vw, 25vw"
              />
            </span>
            <span className="archive-caption">
              <small>{image.number.toString().padStart(3, "0")}</small>
              <span>{image.albumTitle}</span>
            </span>
          </button>
        ))}
      </div>

      {visibleCount < visible.length ? (
        <div className="archive-more" aria-live="polite">
          <span>Exibindo {rendered.length} de {visible.length} fotografias</span>
          <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + ARCHIVE_PAGE_SIZE, visible.length))}>
            Mostrar mais fotografias
          </button>
        </div>
      ) : null}

      {selectedImage ? (
        <dialog
          ref={dialogRef}
          className="lightbox"
          aria-label="Fotografia ampliada"
          onCancel={() => setSelected(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
            if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
          }}
        >
          <button
            className="lightbox-close"
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
          <button
            className="lightbox-arrow previous"
            type="button"
            onClick={() => step(-1)}
            aria-label="Fotografia anterior"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="lightbox-stage"
            onTouchStart={(event) => { if (event.touches.length === 1) touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; else touchStart.current = null; }}
            onTouchEnd={(event) => {
              const start = touchStart.current;
              touchStart.current = null;
              if (!start || !event.changedTouches.length) return;
              const dx = event.changedTouches[0].clientX - start.x;
              const dy = event.changedTouches[0].clientY - start.y;
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
            }}
          >
            <Image
              src={selectedImage.fullSrc}
              alt={selectedImage.alt}
              fill
              sizes="95vw"
              priority
              unoptimized
            />
          </div>
          <div className="lightbox-caption">
            <span>
              {selectedImage.number.toString().padStart(3, "0")} /{" "}
              {visible.length.toString().padStart(3, "0")}
            </span>
            <div>
              <small>{selectedImage.category}</small>
              <p>{selectedImage.alt}</p>
              <Link href={`/ensaios/${selectedImage.albumSlug}`}>
                Ver ensaio completo
              </Link>
            </div>
          </div>
          <button
            className="lightbox-arrow next"
            type="button"
            onClick={() => step(1)}
            aria-label="Próxima fotografia"
          >
            <ArrowRight size={22} />
          </button>
        </dialog>
      ) : null}
    </>
  );
}
