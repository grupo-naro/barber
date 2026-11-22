import "server-only";

import { db } from "@/lib/db";
import { instagramUrl, mapsSearchUrl, whatsappUrl } from "@/lib/landing";
import { mediaUrl } from "@/lib/media";

// Lecturas del contenido de la landing (portada, logo, galería, redes).
// `getPublicLanding` resuelve el tenant por slug y expone solo campos públicos (URLs, nunca
// `barbershopId` ni `storageKey` crudos). `getLandingSettings` es para el panel: el
// `barbershopId` viene SIEMPRE de la sesión del servidor.

export type PublicGalleryImage = { id: string; url: string; alt: string | null };

export type PublicLanding = {
  coverUrl: string | null;
  logoUrl: string | null;
  gallery: PublicGalleryImage[];
  instagram: { handle: string; url: string } | null;
  whatsappUrl: string | null;
  mapsUrl: string | null;
  /** Colores de marca validados que eligió el dueño (`null` = original). El layout los pasa por `brandPalette`. */
  brand: { primary: string | null; secondary: string | null };
};

const gallerySelect = { id: true, storageKey: true, alt: true } as const;

/** `null` si el slug no existe o la barbería está suspendida. */
export async function getPublicLanding(slug: string): Promise<PublicLanding | null> {
  const shop = await db.barbershop.findUnique({
    where: { slug, status: "ACTIVE" },
    select: {
      logoUrl: true,
      coverImageKey: true,
      instagram: true,
      googleMapsUrl: true,
      whatsapp: true,
      address: true,
      brandPrimary: true,
      brandSecondary: true,
      galleryImages: { select: gallerySelect, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!shop) return null;

  const address = shop.address?.trim();
  return {
    coverUrl: shop.coverImageKey ? mediaUrl(shop.coverImageKey) : null,
    logoUrl: shop.logoUrl,
    gallery: shop.galleryImages.map((img) => ({ id: img.id, url: mediaUrl(img.storageKey), alt: img.alt })),
    instagram: shop.instagram ? { handle: shop.instagram, url: instagramUrl(shop.instagram) } : null,
    whatsappUrl: whatsappUrl(shop.whatsapp),
    mapsUrl: shop.googleMapsUrl ?? (address ? mapsSearchUrl(address) : null),
    brand: { primary: shop.brandPrimary, secondary: shop.brandSecondary },
  };
}

export type LandingSettings = {
  logoUrl: string | null;
  coverUrl: string | null;
  gallery: PublicGalleryImage[];
  instagram: string | null;
  googleMapsUrl: string | null;
  hasAddress: boolean;
  brandPrimary: string | null;
  brandSecondary: string | null;
};

/** Contenido de la landing para el panel. `barbershopId` tiene que salir de la sesión. */
export async function getLandingSettings(barbershopId: string): Promise<LandingSettings | null> {
  const shop = await db.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      logoUrl: true,
      coverImageKey: true,
      instagram: true,
      googleMapsUrl: true,
      address: true,
      brandPrimary: true,
      brandSecondary: true,
      galleryImages: { select: gallerySelect, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!shop) return null;
  return {
    logoUrl: shop.logoUrl,
    coverUrl: shop.coverImageKey ? mediaUrl(shop.coverImageKey) : null,
    gallery: shop.galleryImages.map((img) => ({ id: img.id, url: mediaUrl(img.storageKey), alt: img.alt })),
    instagram: shop.instagram,
    googleMapsUrl: shop.googleMapsUrl,
    hasAddress: Boolean(shop.address?.trim()),
    brandPrimary: shop.brandPrimary,
    brandSecondary: shop.brandSecondary,
  };
}

export type PublicOpeningHours = { weekday: number; opensAt: string | null; closesAt: string | null; closed: boolean };

/**
 * Horarios semanales públicos de una barbería, por slug: una fila por franja (horario cortado =
 * 2 filas del mismo weekday), ordenadas por weekday y apertura. Sin caché: `updateOpeningHours` no
 * invalida el tag de branding, así que se lee por request (dentro de un `<Suspense>`).
 * `null` si el slug no existe o la barbería está suspendida.
 */
export async function getPublicOpeningHours(slug: string): Promise<PublicOpeningHours[] | null> {
  const shop = await db.barbershop.findUnique({
    where: { slug, status: "ACTIVE" },
    select: {
      openingHours: {
        select: { weekday: true, opensAt: true, closesAt: true, closed: true },
        orderBy: [{ weekday: "asc" }, { opensAt: "asc" }],
      },
    },
  });
  return shop ? shop.openingHours : null;
}
