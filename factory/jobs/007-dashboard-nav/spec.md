# Navegación del panel

**Pedido:** "Navegación del panel: menú en el layout del dashboard con links a Hoy, Servicios, Caja y Configuración (Servicios, Caja y Configuración solo para OWNER), activo resaltado, mobile-first (barra inferior o menú compacto)."

## Contexto
- `src/app/(dashboard)/layout.tsx` es un Server Component: renderiza `<SessionHeader>` (lee `requireSession()` de `src/lib/auth.ts`) dentro de `<Suspense fallback={<HeaderFallback />}>` porque `cacheComponents: true` obliga a que la lectura de cookies/sesión quede bajo `Suspense`. Después renderiza `<main className="mx-auto ... max-w-3xl ...">{children}</main>`. Hoy no hay ningún menú: para llegar a una sección hay que tipear la URL.
- `src/app/(dashboard)/dashboard/page.tsx` (home `/dashboard`) solo muestra un saludo con rol/slug; no sirve para nada operativo. `requireRole("OWNER")` redirige a `/dashboard` a un BARBER que entra a Caja/Configuración, y el login también aterriza en `/dashboard`.
- Rutas existentes y su autorización en el servidor (no se cambia):
  - `/dashboard/today` (+ `/dashboard/today/customers/[id]`): `requireSession()` → OWNER y BARBER.
  - `/dashboard/services`: `requireSession()` (BARBER ve la lista en solo lectura); `/dashboard/services/[id]`: `requireRole("OWNER")`.
  - `/dashboard/cash`, `/dashboard/settings`: `requireRole("OWNER")`.
  - El pedido dice que Servicios es solo para OWNER en el menú: se respeta textual. Ocultar links es **solo UX**; la autorización real sigue en cada página (y en las Server Actions).
- El rol sale de la sesión del servidor (`session.role`, tipo `SessionRole` de `src/lib/session.ts`, importable como `import type` desde cliente). Nunca del cliente.
- Diseño propuesto (el builder puede ajustar detalles, no la arquitectura):
  - `src/lib/dashboard-nav.ts` (lógica pura, sin React ni `server-only`): la lista de ítems `{ href, label }` (Hoy → `/dashboard/today`, Servicios → `/dashboard/services`, Caja → `/dashboard/cash`, Configuración → `/dashboard/settings`), una función `navItemsForRole(role)` y una función `isNavItemActive(pathname, href)` (activo si `pathname === href` o empieza con `href + "/"`; así `/dashboard/today/customers/x` resalta Hoy y `/dashboard/services/abc` resalta Servicios; `/dashboard/todayx` no). Los íconos (`lucide-react`) se eligen en el componente cliente por `href`, no en la lib.
  - `src/components/dashboard-nav.tsx`: hoja `"use client"` que recibe los ítems ya filtrados por props (datos serializables, sin funciones ni componentes) y usa `usePathname()` para marcar el activo con `aria-current="page"` + estilo con tokens de tema (`text-foreground`/`bg-muted` vs `text-muted-foreground`). Usa `next/link`.
  - Layout: el filtrado por rol se hace en el servidor, dentro del componente async que ya lee la sesión (mismo `<Suspense>` o uno hermano con su propio fallback de altura fija para no generar layout shift). El layout sigue siendo Server Component.
  - Mobile-first: en mobile, barra inferior fija (`fixed inset-x-0 bottom-0`, borde superior, `bg-background`, padding `env(safe-area-inset-bottom)`), ítems con ícono + texto y área táctil ≥ 44px; `<main>` suma padding inferior para que el contenido no quede tapado. Desde `sm:` la barra pasa a una fila de tabs horizontal debajo del header (no fija). Un único `<nav aria-label="Secciones del panel">`.
  - Home `/dashboard`: pasa a `redirect("/dashboard/today")` (Hoy es la pantalla útil para ambos roles). Se elimina el saludo (nombre, rol y barbería ya están en el header).
- Docs de Next 16 a leer: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`, `.../04-functions/redirect.md`, `01-getting-started/04-linking-and-navigating.md`, `01-getting-started/05-server-and-client-components.md`, `01-getting-started/08-caching.md`.
- Sin dependencias nuevas ni componentes shadcn nuevos (alcanzan `Link`, `lucide-react`, `cn` de `@/lib/utils` y los tokens de Tailwind).

## Criterios de aceptación
- **AC-1** `src/lib/dashboard-nav.test.ts` (Vitest) verifica: `navItemsForRole("OWNER")` devuelve Hoy, Servicios, Caja, Configuración en ese orden con sus `href`; `navItemsForRole("BARBER")` devuelve solo Hoy.
- **AC-2** `src/lib/dashboard-nav.test.ts` verifica `isNavItemActive`: `/dashboard/today` y `/dashboard/today/customers/abc` activan Hoy; `/dashboard/services/abc` activa Servicios; `/dashboard/todayx` y `/dashboard` no activan ninguno; exactamente un ítem activo por pathname de sección.
- **AC-3** Logueado como OWNER (seed), en cada una de `/dashboard/today`, `/dashboard/services`, `/dashboard/cash`, `/dashboard/settings` el HTML incluye un `<nav aria-label="Secciones del panel">` con los 4 links, y el link de la página actual tiene `aria-current="page"` (y solo ese). En `/dashboard/today/customers/<id>` el activo es Hoy.
- **AC-4** Logueado como BARBER, `/dashboard/today` muestra el nav con solo el link Hoy (no aparecen `href="/dashboard/services"`, `/dashboard/cash` ni `/dashboard/settings` en el HTML). Entrar a mano a `/dashboard/cash` o `/dashboard/settings` sigue redirigiendo (comportamiento existente de `requireRole`, sin cambios).
- **AC-5** `GET /dashboard` con sesión responde redirect (307) a `/dashboard/today`; sin sesión termina en `/login` (proxy/`requireSession`, sin cambios). Un BARBER que entra a `/dashboard/cash` termina en `/dashboard/today` sin bucles.
- **AC-6** UI mobile (viewport 375px): la barra está fija abajo, no tapa el último elemento de la página (padding inferior en `<main>`), cada link mide ≥ 44px de alto; en ≥ 640px se ve como fila de tabs bajo el header. El layout `src/app/(dashboard)/layout.tsx` no tiene `"use client"` y `usePathname` solo aparece en `src/components/dashboard-nav.tsx`. `pnpm build` no emite errores de "uncached data accessed outside of `<Suspense>`".
- **AC-7** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/components/dashboard-nav.tsx`
- `src/lib/dashboard-nav.ts`
- `src/lib/dashboard-nav.test.ts`

## Fuera de alcance
- Cambiar la autorización de cualquier página o Server Action (por ejemplo, volver `/dashboard/services` solo-OWNER en el servidor; queda para otro job si se decide).
- Tocar `src/proxy.ts` (`PRIVATE_PREFIXES`, matcher, `safeNext`): lo está modificando el job 008 en paralelo.
- Tocar `src/lib/auth.ts` o `src/lib/session.ts` (solo `import type { SessionRole }`).
- Agregar componentes shadcn (`sheet`, `navigation-menu`, `tabs`, …), dependencias nuevas, menú hamburguesa/drawer, sidebar de escritorio, contadores/badges en los ítems o un dashboard con métricas en la home.
- Rediseñar el header (logout, nombre, badge de rol) más allá de lo necesario para ubicar el nav.

## Riesgos
- Auth: el filtrado de links por rol debe hacerse en el servidor a partir de `session.role`; nunca pasar el rol desde el cliente ni confiar en el nav como control de acceso. Las páginas ya autorizan.
- `cacheComponents`: la lectura de sesión para el nav tiene que quedar dentro de `<Suspense>` (con fallback de alto fijo); el `redirect` de `/dashboard` no debe romper el prerender del build.
- Sin cambios de schema, dinero ni dependencias.
