import { cacheLife, cacheTag } from "next/cache";
import { getPublicBarbershop } from "@/server/queries/booking";
import { getPublicLanding } from "@/server/queries/landing";

/** Tag del branding público de una barbería: lo invalida el panel al guardar el perfil. */
export function barbershopBrandingTag(slug: string) {
  return `barbershop-branding:${slug}`;
}

/**
 * Branding público de la barbería, cacheado con vida corta: cambia poco y permite
 * resolver el slug (y responder 404) antes de empezar a hacer streaming. Sólo campos
 * públicos; la disponibilidad nunca se cachea.
 */
export async function getCachedBarbershop(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(barbershopBrandingTag(slug));
  return getPublicBarbershop(slug);
}

/**
 * Contenido público de la landing (portada, logo, galería, redes). Mismo tag que el branding:
 * el panel lo invalida con `updateTag(barbershopBrandingTag(slug))` en cada cambio.
 * `null` si el slug no existe.
 */
export async function getCachedLanding(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(barbershopBrandingTag(slug));
  return getPublicLanding(slug);
}
