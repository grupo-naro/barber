import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { validateSlug } from "@/lib/slugs";

// Chequeo OPTIMISTA: solo verifica la firma/vigencia del JWT (sin DB).
// La autorización real (usuario activo, tenant correcto) la hace `src/lib/auth.ts`.

/** Rutas del panel (reservadas: no pueden usarse como slug público). */
export const PRIVATE_PREFIXES = ["/dashboard", "/settings", "/services", "/today", "/cash"] as const;

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const INTERNAL_ORIGIN = "http://internal.invalid";

/**
 * Destino post-login seguro (anti open-redirect): se resuelve con el parser WHATWG contra un origen fijo
 * (que descarta tabs/CR/LF y normaliza `\` como hacen los navegadores) y solo se acepta si queda en el mismo
 * origen y en una ruta privada conocida. Cualquier otra cosa → `/dashboard`.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/dashboard";
  try {
    const url = new URL(next, INTERNAL_ORIGIN);
    if (url.origin === INTERNAL_ORIGIN && isPrivatePath(url.pathname)) return url.pathname + url.search;
  } catch {
    // URL inválida → default
  }
  return "/dashboard";
}

export type RouteDecision = { action: "next" } | { action: "redirect"; location: string };

/** Decisión de ruteo pura (testeable): `location` es path + query relativos al origen. */
export function decideRoute(pathname: string, search: string, hasValidSession: boolean): RouteDecision {
  if (isPrivatePath(pathname) && !hasValidSession) {
    const next = encodeURIComponent(pathname + search);
    return { action: "redirect", location: `/login?next=${next}` };
  }
  if (pathname === "/login" && hasValidSession) {
    return { action: "redirect", location: "/dashboard" };
  }
  return { action: "next" };
}

/**
 * Si el path es de un solo segmento sin punto (candidato a página pública `/<slug>`), devuelve ese
 * segmento; si no (`/`, archivos estáticos, rutas de más de un segmento), `null`.
 */
export function publicSlugFromPath(pathname: string): string | null {
  const match = /^\/([^/.]+)$/.exec(pathname);
  return match ? match[1] : null;
}

export type SlugDecision = { action: "skip" } | { action: "next" } | { action: "not-found" };

/**
 * Decisión pura del chequeo de slug público. `slugExists` solo se llama si el slug es válido
 * (formato OK y no reservado); los reservados/inválidos son 404 sin tocar la DB.
 */
export async function decidePublicSlug(
  pathname: string,
  slugExists: (slug: string) => Promise<boolean>,
): Promise<SlugDecision> {
  const slug = publicSlugFromPath(pathname);
  if (slug === null) return { action: "skip" };
  if (!validateSlug(slug).ok) return { action: "not-found" };
  return (await slugExists(slug)) ? { action: "next" } : { action: "not-found" };
}

/** Lookup real (import diferido: los tests de este archivo corren sin Prisma). Fail-open si la DB falla. */
async function slugExistsInDb(slug: string): Promise<boolean> {
  try {
    const { barbershopSlugExists } = await import("@/server/queries/slug-exists");
    return await barbershopSlugExists(slug);
  } catch (error) {
    console.error("[proxy] no se pudo verificar el slug; sigue la página", error);
    return true;
  }
}

/** Ruta de dos segmentos que no matchea nada (ni `/[slug]`): renderiza el not-found global con 404. */
const NOT_FOUND_REWRITE = "/_not-found-slug/x";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // Solo verificamos el JWT cuando la decisión depende de la sesión.
  const needsSession = pathname === "/login" || isPrivatePath(pathname);
  if (!needsSession) {
    const slugDecision = await decidePublicSlug(pathname, slugExistsInDb);
    if (slugDecision.action === "not-found") {
      return NextResponse.rewrite(new URL(NOT_FOUND_REWRITE, request.nextUrl.origin));
    }
    return NextResponse.next();
  }

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const decision = decideRoute(pathname, search, session !== null);
  if (decision.action === "redirect") {
    return NextResponse.redirect(new URL(decision.location, request.nextUrl.origin));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Páginas públicas `/<slug>`: un solo segmento sin punto (excluye `/`, estáticos y rutas anidadas como
    // `/_next/**` o `/api/**`). `/_next` o `/api` sueltos entran, pero son reservados → 404 sin DB.
    "/:slug([^/.]+)",
    "/login",
    "/dashboard/:path*",
    "/settings/:path*",
    "/services/:path*",
    "/today/:path*",
    "/cash/:path*",
  ],
};
