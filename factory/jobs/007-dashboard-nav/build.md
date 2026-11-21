# Build: 007-dashboard-nav
**Rama:** factory/007-dashboard-nav · **Commit:** f7a0a0c · **Worktree:** .worktrees/007-dashboard-nav

## Qué cambió
- `src/lib/dashboard-nav.ts`: lógica pura: `DashboardNavItem`, `navItemsForRole(role)` (OWNER: Hoy, Servicios, Caja, Configuración; BARBER: solo Hoy) e `isNavItemActive(pathname, href)` (igualdad o prefijo `href + "/"`).
- `src/lib/dashboard-nav.test.ts`: tests de Vitest para AC-1 y AC-2.
- `src/components/dashboard-nav.tsx`: hoja `"use client"`; recibe los ítems ya filtrados como props serializables, usa `usePathname()` + `next/link`, marca el activo con `aria-current="page"` y `bg-muted text-foreground` (los inactivos van con `text-muted-foreground`). Elige el ícono de lucide según el `href`. Un único `<nav aria-label="Secciones del panel">`: en mobile es una barra fija abajo (`fixed inset-x-0 bottom-0`, `border-t`, `bg-background`, `pb-[env(safe-area-inset-bottom)]`, links `min-h-14` = 56px); desde `sm:` pasa a `static`, como fila de tabs bajo el header con links `min-h-11`.
- `src/app/(dashboard)/layout.tsx`: `SessionHeader` (async, dentro del `<Suspense>` que ya existía) renderiza el header y además `<DashboardNav items={navItemsForRole(session.role)} />`, así que el rol se filtra en el servidor. El fallback suma un placeholder de nav con altura fija (barra abajo en mobile, `h-13.25` desde sm) para evitar layout shift. `<main>` pasa a `pb-[calc(3.5rem+env(safe-area-inset-bottom)+1.5rem)] sm:pb-6`. Sigue siendo Server Component.
- `src/app/(dashboard)/dashboard/page.tsx`: ahora hace `redirect("/dashboard/today")` y se eliminó el saludo. Además lleva `export const instant = false`: sin eso, cada request en dev logueaba `Route "/dashboard": Could not validate \`instant\` because an error prevented the target segment from rendering. [cause]: NEXT_REDIRECT`. Es la opción que documenta `adopting-partial-prefetching.md` para sacar una ruta de la validación de navegación instantánea, y una ruta que es solo un redirect no tiene UI que validar. Probé `await connection()` antes del redirect y era peor ("uncached data during prerendering").

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `pnpm test`: `dashboard-nav.test.ts` verifica el orden y los href para OWNER, y solo Hoy para BARBER (110/110 tests en verde). |
| AC-2 | ✅ | Mismo archivo: activan `/dashboard/today` y `/dashboard/today/customers/abc` (Hoy) y `/dashboard/services/abc` (Servicios); no activan `/dashboard/todayx` ni `/dashboard`; cada href de sección activa exactamente un ítem. |
| AC-3 | ✅ | Dev en :3001 con seed y cookie de OWNER firmada con el `SESSION_SECRET` del worktree, con curl: en `/dashboard/{today,services,cash,settings}` el `<nav aria-label="Secciones del panel">` trae los 4 links y `aria-current="page"` aparece solo en el de la página actual. En `/dashboard/today/customers/<id>` el activo es Hoy. |
| AC-4 | ✅ | BARBER (martin) en `/dashboard/today`: el nav tiene solo `href="/dashboard/today"` con `aria-current`, y el grep de `href="/dashboard/(services\|cash\|settings)"` vuelve vacío. En `/dashboard/cash` y `/dashboard/settings` `requireRole` sigue igual: stream con `NEXT_REDIRECT;replace;/dashboard;307` y meta refresh. |
| AC-5 | ✅ | `GET /dashboard` con sesión (OWNER y BARBER) → `307 Location /dashboard/today`. Sin sesión → `/login?next=%2Fdashboard`. Un BARBER en `/dashboard/cash` va a `/dashboard` y de ahí 307 a `/dashboard/today`, sin bucle (Hoy no redirige). |
| AC-6 | ✅* | Por inspección de clases: barra `fixed bottom-0` en mobile; `<main>` con padding inferior de 3.5rem + safe-area + 1.5rem (la barra mide 3.5rem); links de `min-h-14` (56px ≥ 44px); desde `sm:` es `static` y queda como fila de tabs bajo el header. `layout.tsx` no tiene `"use client"` y `usePathname` aparece solo en `src/components/dashboard-nav.tsx` (grep). `pnpm build` no emite el error de "uncached data". *No lo verifiqué con un navegador a 375px: no hay un navegador headless disponible sin agregar dependencias. |
| AC-7 | ✅ | Abajo. |

## Checks
lint ✅ · typecheck ✅ · test ✅ (110/110) · build ✅

Dev server en :3001 detenido. El diff contra main (`git diff --name-only main...HEAD`) son solo los 5 archivos del scope.
