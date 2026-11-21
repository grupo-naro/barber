import type { SVGProps } from "react";

/** Display condensada en mayúsculas (Anton, cargada en `layout.tsx`). Ver `.landing-display`. */
export const displayFont = "landing-display";

/** Tag decorativo en brush script con contorno de sticker (Kaushan Script). Uno por sección como mucho. */
export const scriptTag = "landing-tag";

/** Botón/CTA sticker: borde grueso, sombra dura desplazada y display en mayúsculas. */
export const stickerButton = "landing-btn h-12 gap-2 px-5 text-lg [&_svg:not([class*='size-'])]:size-5";

/** Contenedor de las secciones de la landing. */
export const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";

/** Links sueltos. El foco visible lo pone `landing.css` para todo control dentro de `.landing-theme`. */
export const focusRing = "rounded-sm";

/** Ícono de Instagram propio (lucide ya no trae íconos de marca). */
export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}
