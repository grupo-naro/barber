// Validación de slugs públicos de barberías (`/<slug>`). Puro: sin Next ni Prisma.

/**
 * Segmentos que no pueden usarse como slug: rutas propias de la app (panel, auth, API),
 * internos de Next y nombres de archivos/rutas conocidos.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "login",
  "logout",
  "signup",
  "register",
  "dashboard",
  "settings",
  "services",
  "today",
  "cash",
  "api",
  "_next",
  "admin",
  "auth",
  "static",
  "public",
  "assets",
  "invitacion", // links de invitación de barberos: /invitacion/<token>
  "media", // archivos subidos por las barberías: /media/<barbershopId>/<archivo>
  "app",
  "www",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.json",
  "not-found",
  "404",
  "500",
]);

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;
const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugValidation = { ok: true } | { ok: false; error: string };

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/** Un slug válido tiene formato correcto (minúsculas, dígitos y guiones simples) y no está reservado. */
export function validateSlug(slug: string): SlugValidation {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return { ok: false, error: `El slug tiene que tener entre ${SLUG_MIN_LENGTH} y ${SLUG_MAX_LENGTH} caracteres.` };
  }
  if (isReservedSlug(slug)) {
    return { ok: false, error: `"${slug}" es una dirección reservada. Elegí otra.` };
  }
  if (!SLUG_FORMAT.test(slug)) {
    return {
      ok: false,
      error: "Usá solo minúsculas sin acentos, números y guiones simples (sin guion al principio ni al final).",
    };
  }
  return { ok: true };
}
