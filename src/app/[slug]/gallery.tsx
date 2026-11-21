"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Photo = { id: string; url: string; alt: string | null };

const controlClass =
  "landing-btn flex size-12 items-center justify-center bg-white text-black [--sticker-shadow:var(--rojo)]";

/**
 * Grilla de "Nuestros trabajos" con lightbox en un `<dialog>` nativo: Escape y "Cerrar" lo
 * cierran, ←/→ navegan, y al cerrar el foco vuelve a la miniatura de la foto que se estaba viendo.
 */
export function Gallery({ photos, shopName }: { photos: Photo[]; shopName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [index, setIndex] = useState<number | null>(null);

  const altOf = (p: Photo) => p.alt?.trim() || `Trabajo de ${shopName}`;

  // Se abre después de renderizar la foto, así `autoFocus` lleva el foco a "Cerrar".
  useEffect(() => {
    const dialog = dialogRef.current;
    if (index !== null && dialog && !dialog.open) dialog.showModal();
  }, [index]);

  function step(delta: number) {
    setIndex((i) => (i === null ? i : (i + delta + photos.length) % photos.length));
  }

  function onClose() {
    const i = index;
    setIndex(null);
    if (i !== null) thumbRefs.current[i]?.focus();
  }

  const current = index === null ? null : photos[index];

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 pr-1.5 sm:gap-6 md:grid-cols-3">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              ref={(el) => {
                thumbRefs.current[i] = el;
              }}
              onClick={() => setIndex(i)}
              aria-haspopup="dialog"
              className={cn(
                "landing-sticker landing-lift group relative block aspect-[4/5] w-full overflow-hidden rounded-sm bg-muted [--sticker-edge:var(--tiza)]",
                i % 2 === 0 ? "[--sticker-shadow:var(--rojo)]" : "[--sticker-shadow:var(--royal)]",
              )}
            >
              <Image
                src={p.url}
                alt={altOf(p)}
                fill
                sizes="(min-width: 1152px) 380px, (min-width: 768px) 33vw, 50vw"
                className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        className="landing-lightbox"
        aria-label={current ? altOf(current) : "Foto ampliada"}
        onClose={onClose}
        onKeyDown={(e) => {
          if (photos.length < 2) return;
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        {current ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-4 p-4">
              <p className="text-sm text-foreground/80 tabular-nums">
                {index! + 1} de {photos.length}
              </p>
              <button
                type="button"
                autoFocus
                onClick={() => dialogRef.current?.close()}
                className={cn(controlClass, "w-auto gap-2 px-4 text-base")}
              >
                <X className="size-4" aria-hidden />
                Cerrar
              </button>
            </div>
            <div className="relative min-h-0 flex-1">
              <Image key={current.id} src={current.url} alt={altOf(current)} fill sizes="100vw" className="object-contain" />
            </div>
            <div className="flex items-center justify-between gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {photos.length > 1 ? (
                <>
                  <button type="button" onClick={() => step(-1)} className={controlClass} aria-label="Foto anterior">
                    <ChevronLeft className="size-5" aria-hidden />
                  </button>
                  <p className="line-clamp-2 min-w-0 flex-1 text-center text-sm text-foreground/80">
                    {current.alt?.trim() || null}
                  </p>
                  <button type="button" onClick={() => step(1)} className={controlClass} aria-label="Foto siguiente">
                    <ChevronRight className="size-5" aria-hidden />
                  </button>
                </>
              ) : (
                <p className="flex-1 text-center text-sm text-foreground/80">{current.alt?.trim() || null}</p>
              )}
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
