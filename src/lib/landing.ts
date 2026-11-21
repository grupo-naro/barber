// Validación pura del contenido de la landing pública: redes (Instagram, Google Maps) y galería.
// Sin Prisma ni Next: la usan las Server Actions, la lectura pública y sus tests.
import { z } from "zod";

const INSTAGRAM_HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);

/**
 * Normaliza un usuario de Instagram a su handle sin `@`. Acepta `user`, `@user`,
 * `instagram.com/user` y `https://www.instagram.com/user/?hl=es`. Devuelve `null` si no es válido.
 */
export function normalizeInstagram(raw: string): string | null {
  let value = raw.trim();
  if (value === "") return null;

  if (value.includes("/") || /instagram\.com/i.test(value)) {
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    let url: URL;
    try {
      url = new URL(withProtocol);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.port) return null;
    if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return null;
    value = segments[0];
  }

  if (value.startsWith("@")) value = value.slice(1);
  return INSTAGRAM_HANDLE_RE.test(value) ? value : null;
}

/** URL del perfil de Instagram de un handle ya normalizado. */
export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

/**
 * `true` solo para links `https:` de Google Maps: `google.com/maps…`, `www.google.com/maps…`,
 * `maps.google.com/…`, `maps.app.goo.gl/…` o `goo.gl/maps/…`.
 */
export function isGoogleMapsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  switch (host) {
    case "google.com":
    case "www.google.com":
      return path === "/maps" || path.startsWith("/maps/");
    case "maps.google.com":
    case "maps.app.goo.gl":
      return true;
    case "goo.gl":
      return path === "/maps" || path.startsWith("/maps/");
    default:
      return false;
  }
}

/** Búsqueda de Google Maps por dirección (fallback cuando la barbería no cargó un link). */
export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Link de WhatsApp (`https://wa.me/<dígitos>`) o `null` si no quedan dígitos. */
export function whatsappUrl(whatsapp: string | null | undefined): string | null {
  const digits = (whatsapp ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

/** String opcional: trim, vacío → `null`. */
const blankToNull = z
  .string()
  .nullish()
  .transform((v) => {
    const t = v?.trim() ?? "";
    return t === "" ? null : t;
  });

export const socialLinksSchema = z.object({
  instagram: blankToNull.transform((v, ctx) => {
    if (v === null) return null;
    const handle = normalizeInstagram(v);
    if (handle === null) {
      ctx.addIssue({
        code: "custom",
        message: "Ingresá un usuario de Instagram válido (ej. @tubarberia o instagram.com/tubarberia)",
      });
      return z.NEVER;
    }
    return handle;
  }),
  googleMapsUrl: blankToNull.transform((v, ctx) => {
    if (v === null) return null;
    if (v.length > 2048 || !isGoogleMapsUrl(v)) {
      ctx.addIssue({
        code: "custom",
        message: "Pegá un link de Google Maps que empiece con https:// (ej. https://maps.app.goo.gl/…)",
      });
      return z.NEVER;
    }
    return v;
  }),
});

export type SocialLinksInput = z.input<typeof socialLinksSchema>;
export type SocialLinksData = z.output<typeof socialLinksSchema>;

export const GALLERY_ALT_MAX = 150;

const imageIdSchema = z.string({ error: "Foto inválida" }).trim().min(1, "Foto inválida").max(100, "Foto inválida");

export const galleryAltSchema = z.object({
  id: imageIdSchema,
  alt: blankToNull.refine((v) => v === null || v.length <= GALLERY_ALT_MAX, {
    message: `La descripción puede tener hasta ${GALLERY_ALT_MAX} caracteres`,
  }),
});

export const galleryMoveSchema = z.object({
  id: imageIdSchema,
  direction: z.enum(["up", "down"], { error: "Dirección inválida" }),
});

export const galleryIdSchema = z.object({ id: imageIdSchema });
