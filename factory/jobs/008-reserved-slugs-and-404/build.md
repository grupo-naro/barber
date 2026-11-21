# Build: 008-reserved-slugs-and-404
**Rama:** factory/008-reserved-slugs-and-404 · **Commit:** e97e25e · **Worktree:** .worktrees/008-reserved-slugs-and-404

## Qué cambió
- `src/lib/slugs.ts`: nuevo, puro. `RESERVED_SLUGS` (los 25 del spec), `isReservedSlug`, `validateSlug` (largo de 3 a 40, reservado, formato `^[a-z0-9]+(?:-[a-z0-9]+)*$`; mensajes en rioplatense).
- `src/lib/slugs.test.ts`: nuevo. Casos de AC-1, slugs del seed y de los smoke leídos como texto (AC-2), y `PRIVATE_PREFIXES` ⊂ reservados.
- `src/server/queries/slug-exists.ts`: nuevo. `barbershopSlugExists(slug)` hace `findUnique({ where: { slug }, select: { id: true } })` y devuelve un booleano.
- `src/proxy.ts`: agrega `publicSlugFromPath` y `decidePublicSlug(pathname, slugExists)` (puras, con el lookup inyectado). El lookup real importa `slug-exists` de forma diferida y, si falla, deja pasar el request (fail-open) con `console.error`. Se agrega `"/:slug([^/.]+)"` al matcher. La lógica de sesión, `safeNextPath` y `decideRoute` no cambian.
- `src/proxy.test.ts`: tests nuevos de la decisión de slug (AC-3). Los tests anteriores siguen igual.
- `src/app/[slug]/page.tsx`: `page` y `generateMetadata` llaman a `validateSlug` antes de `getCachedBarbershop`. Un slug reservado o inválido, incluido el placeholder `__barberia__`, no consulta la DB.
- `src/app/not-found.tsx`: nuevo. UI global de 404 en español con `noindex`.
- `src/app/[slug]/not-found.tsx`: nuevo. "Barbería no encontrada", para cuando la página llama a `notFound()` (por ejemplo, en el camino fail-open).
- `src/app/[slug]/data.ts`: sin cambios (no hizo falta).

## Decisiones
- **Cómo se devuelve el 404:** `NextResponse.rewrite` a `/_not-found-slug/x`. Es una ruta de dos segmentos: no la captura `/[slug]` y no matchea ninguna otra ruta. Con `next start` devuelve **404 desde el primer request**, con la UI de `src/app/not-found.tsx`. También devuelve 404 con `RSC: 1`. No hizo falta el fallback de HTML a mano.
- **Matcher:** `"/:slug([^/.]+)"`, sin el lookahead `(?!_next|api)` que proponía el spec. Ese lookahead también excluía slugs válidos que empiezan con `api` (por ejemplo `apis-barber`), y esos se quedaban sin el 404 real. Los paths de varios segmentos (`/_next/**`, `/api/**`, `/dashboard/**`) y los que tienen punto (`/favicon.ico`) ya quedan afuera por el patrón. `/_next` y `/api` sueltos sí entran, pero son reservados, así que dan 404 sin tocar la DB.
- `/login` y las rutas privadas de un segmento (por ejemplo `/dashboard`) entran por la rama de sesión antes del chequeo de slug, así que no cambian de comportamiento.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `src/lib/slugs.test.ts`: válidos, 12 inválidos y todos los `RESERVED_SLUGS` con `ok:false` y mensaje; `isReservedSlug` |
| AC-2 | ✅ | Encuentra 6 slugs (`barberia-demo`, `otra-barberia`, `smoke-004`, `smoke-004-other`, `smoke-006`, `smoke-006-other`) y todos validan. Test de coherencia de `PRIVATE_PREFIXES` |
| AC-3 | ✅ | `src/proxy.test.ts` corre sin DB. `/no-existe-xyz` con lookup false → not-found. `/barberia-demo` con lookup true → next. Reservados e inválidos → not-found con 0 llamadas al lookup. `/`, `/favicon.ico`, `/dashboard/cash`, `/_next/static/a.js` y `/api/x` → skip |
| AC-4 | ✅ | Ver la salida abajo (`pnpm build && pnpm start -p 3108`, servidor recién levantado, DB seedeada) |
| AC-5 | ✅ | `/barberia-demo?service=…&barber=any` → 200 con "Elegí el servicio/día". Con `&date=2026-11-21` → 200 con "Elegí el horario" y 48 horarios (09:00, 09:15…). `RSC: 1` a `/no-existe-otro` → 404. Log del server: 0 líneas con "prisma"/"error" |
| AC-6 | ✅ | Ver Checks |

Salida de AC-4 y AC-5 (`next start -p 3108`, primer request de cada URL):
```
/no-existe-xyz     404
/no-existe-xyz     404
/admin             404
/barberia-demo     200
/dashboard         307 http://localhost:3108/login?next=%2Fdashboard
/login             200
/favicon.ico       200
/__barberia__      404
/Barberia          404
/api               404
/_next             404
--- 404 body (/otro-inexistente):
      3 No encontramos esta página
      4 noindex
--- demo body:
<title>Barbería Demo · Reservá tu turno</title>
--- RSC: 1 /no-existe-otro:
404
```
El servidor quedó apagado después de la prueba.

## Notas para review
- Costo: cada request a `/<slug-válido>` hace una query indexada extra en Proxy, incluidos el prefetch RSC y el POST de la Server Action. Los paths inválidos o reservados no consultan la DB.
- El fail-open (la DB no responde → la página decide) no se probó end-to-end, para no tirar el Postgres compartido. La rama está cubierta por el `try/catch` de `slugExistsInDb`.

## Checks
lint ✅ · typecheck ✅ · test ✅ (115 tests) · build ✅
