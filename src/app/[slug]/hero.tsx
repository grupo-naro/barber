import Image from "next/image";
import { CalendarCheck, MapPin, MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicBarbershop } from "@/server/queries/booking";
import { initials } from "./landing-format";
import { container, displayFont, focusRing, InstagramIcon, scriptTag, stickerButton } from "./ui";

type Props = {
  shop: PublicBarbershop;
  coverUrl: string | null;
  logoUrl: string | null;
  instagram: { handle: string; url: string } | null;
  whatsappHref: string | null;
};

/**
 * Logo como sticker: badge blanco con borde negro grueso y sombra dura, apenas girado. Los logos
 * suelen venir sobre fondo blanco, así que se muestran completos (`object-contain`), sin recortar.
 */
function Logo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const badge =
    "landing-sticker relative block size-28 shrink-0 -rotate-3 overflow-hidden rounded-xl bg-white p-1.5 sm:size-36";
  if (!logoUrl) {
    return (
      <span aria-hidden className={cn(badge, "flex items-center justify-center")}>
        <span className={cn(displayFont, "text-5xl leading-none text-black sm:text-6xl")}>{initials(name)}</span>
      </span>
    );
  }
  if (logoUrl.startsWith("/media/")) {
    return (
      <span className={badge}>
        <span className="relative block size-full">
          <Image src={logoUrl} alt={`Logo de ${name}`} fill sizes="(min-width: 640px) 144px, 112px" className="object-contain" />
        </span>
      </span>
    );
  }
  // Logo viejo con URL externa: <img> nativo, sin abrir `remotePatterns`.
  return (
    <span className={badge}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt={`Logo de ${name}`} className="size-full object-contain" />
    </span>
  );
}

export function Hero({ shop, coverUrl, logoUrl, instagram, whatsappHref }: Props) {
  return (
    <header className="landing-grain relative isolate overflow-hidden">
      {coverUrl ? (
        <>
          <Image src={coverUrl} alt="" fill preload sizes="100vw" className="-z-20 object-cover" />
          {/* Overlay: negro fuerte abajo (donde va el texto) y arriba (logo), para contraste AA. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,#000_0%,rgb(0_0_0/0.86)_40%,rgb(0_0_0/0.5)_72%,rgb(0_0_0/0.7)_100%)]"
          />
          {/* En desktop, la banda del poste compone el lado derecho también sobre la portada. */}
          <div
            aria-hidden
            className="landing-pole landing-pole-spin pointer-events-none absolute top-[-20%] right-[6%] -z-10 hidden h-[150%] w-56 rotate-[28deg] border-x-[3px] border-black lg:block"
          />
        </>
      ) : (
        // Sin portada: un poste de barbería gigante cruzando en diagonal, trama de puntos y las
        // iniciales en contorno. Todo decorativo.
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="landing-halftone absolute inset-0" />
          <div className="landing-pole landing-pole-spin absolute top-[-14%] right-[-6%] h-[40%] w-20 rotate-[28deg] border-x-[3px] border-black sm:top-[-20%] sm:right-[-12%] sm:h-[150%] sm:w-48 lg:right-[6%] lg:w-64" />
          <span
            className={cn(
              displayFont,
              "absolute -bottom-[0.18em] -left-[0.04em] text-[clamp(12rem,42vw,30rem)] leading-none text-transparent select-none [-webkit-text-stroke:2px_rgb(255_255_255/0.14)]",
            )}
          >
            {initials(shop.name)}
          </span>
        </div>
      )}

      <div
        className={cn(
          container,
          "flex flex-col justify-between gap-12 pt-6 pb-14 sm:pt-8 md:pb-20",
          coverUrl ? "min-h-[86svh]" : "min-h-[72svh]",
        )}
      >
        <div className="flex items-start justify-between gap-4 pt-1 pl-1">
          <Logo name={shop.name} logoUrl={logoUrl} />
          {instagram ? (
            <a
              href={instagram.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                focusRing,
                "flex min-h-11 items-center gap-2 bg-black px-3 text-sm font-medium text-white transition-colors hover:text-[var(--rojo-claro)]",
              )}
            >
              <InstagramIcon className="size-4" />@{instagram.handle}
            </a>
          ) : null}
        </div>

        {/* El texto queda a la izquierda de la banda del poste (nunca encima de las franjas). */}
        <div className={cn("flex flex-col gap-6", coverUrl ? "max-w-4xl lg:max-w-[60%]" : "sm:max-w-[60%]")}>
          <div className="relative">
            <span aria-hidden className={cn(scriptTag, "mb-1 -ml-1 -rotate-6 text-3xl sm:text-4xl")}>
              Barbershop
            </span>
            <h1
              className={cn(
                displayFont,
                coverUrl ? "text-[clamp(4rem,18vw,10rem)]" : "text-[clamp(4rem,18vw,10rem)] sm:text-[clamp(4rem,11vw,10rem)]",
                "leading-[0.88] text-balance break-words hyphens-auto",
                "[text-shadow:0.045em_0.045em_0_var(--royal)]",
              )}
            >
              {shop.name}
            </h1>
          </div>
          {shop.description ? (
            <p className="max-w-xl text-lg leading-relaxed text-white/90 sm:text-xl">{shop.description}</p>
          ) : null}
          {shop.address ? (
            <p className="flex items-start gap-2 text-sm text-white/85">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--rojo-claro)]" aria-hidden />
              <span className="min-w-0 break-words">{shop.address}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-4 pt-2">
            <a href="#reservar" className={buttonVariants({ className: stickerButton })}>
              <CalendarCheck aria-hidden />
              Reservar turno
            </a>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  variant: "outline",
                  // Secundario: oscuro con borde blanco, para que "Reservar turno" (rojo) domine.
                  className: cn(
                    stickerButton,
                    "bg-black text-white [--sticker-edge:var(--tiza)] [--sticker-shadow:var(--royal)] hover:bg-black hover:text-white dark:bg-black dark:hover:bg-black",
                  ),
                })}
              >
                <MessageCircle aria-hidden />
                Escribinos por WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
