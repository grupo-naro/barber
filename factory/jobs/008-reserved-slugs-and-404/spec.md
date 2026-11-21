# Slugs reservados y 404 real en `/[slug]`

**Pedido:** "Slugs reservados (`login`, `dashboard`, `api`, `_next` y similares) rechazados al validar un slug + 404 real (status HTTP 404) para slugs inexistentes en `/[slug]`, también con `next start`."

## Contexto
**Qué existe hoy**
- `Barbershop.slug` es `String @unique` (`prisma/schema.prisma`). **No hay UI** que cree o edite slugs: hoy solo los crean `prisma/seed.ts` (`barberia-demo`, `otra-barberia`) y los scripts de smoke (`smoke-004`, `smoke-004-other`, `smoke-006`, `smoke-006-other`). No hay ninguna validación de formato ni lista de reservados.
- `src/proxy.ts` (hot file, auth, job 001): `PRIVATE_PREFIXES` (`/dashboard`, `/settings`, `/services`, `/today`, `/cash`), `safeNextPath`, `decideRoute` (puro, testeado en `src/proxy.test.ts`) y `proxy()`, que hoy solo corre (vía `config.matcher`) en `/login` y en las rutas privadas, y solo verifica el JWT (sin DB).
- `src/app/[slug]/page.tsx`: `generateStaticParams` devuelve un placeholder (`__barberia__`), `instant = false`, y llama a `notFound()` antes del `<Suspense>` si `getCachedBarbershop(slug)` (`data.ts`: `"use cache"` + `cacheLife("minutes")` + `cacheTag`) devuelve `null`. La lectura real es `getPublicBarbershop(slug)` en `src/server/queries/booking.ts`.
- **El problema conocido** (`factory/jobs/004-public-booking-page/build.md`, "Notas para review"): con `cacheComponents: true`, en `next start` el **primer** request a un slug inexistente recibe el shell prerenderizado con **200** (body = UI de not-found + `noindex`); los siguientes dan 404. En `pnpm dev` da 404 siempre, así que el bug solo se ve con `pnpm build && pnpm start`.

**Docs de Next 16 que el builder tiene que leer** (`node_modules/next/dist/docs/01-app/`)
- `02-guides/streaming.md`, sección "The HTTP contract" / "Status codes": con Cache Components el shell arranca la respuesta en 200 aunque haya `instant = false`; *"To return a request-time 404, use Proxy before the page renders."*
- `03-api-reference/03-file-conventions/loading.md#status-codes` (lo mismo).
- `01-getting-started/16-proxy.md` y `03-api-reference/03-file-conventions/proxy.md`: matcher (regex, y que matchea también requests RSC/prefetch), `NextResponse.rewrite`, orden de ejecución, y **Runtime: Proxy usa Node.js por defecto** (por eso puede consultar Postgres con Prisma).
- `03-api-reference/04-functions/not-found.md` y `03-file-conventions/not-found.md`.

**Enfoque elegido: chequeo de existencia en Proxy, acotado a paths de un solo segmento.**
1. `src/lib/slugs.ts` (nuevo, puro, sin imports de Next ni Prisma): `RESERVED_SLUGS` (como mínimo `login`, `logout`, `signup`, `register`, `dashboard`, `settings`, `services`, `today`, `cash`, `api`, `_next`, `admin`, `auth`, `static`, `public`, `assets`, `app`, `www`, `favicon.ico`, `robots.txt`, `sitemap.xml`, `manifest.json`, `not-found`, `404`, `500`), `isReservedSlug(slug)` y `validateSlug(slug)` → `{ ok: true } | { ok: false; error: string }` (error en español rioplatense). Formato: `^[a-z0-9]+(?:-[a-z0-9]+)*$` (minúsculas, dígitos y guiones simples, sin guion al principio/fin), largo entre 3 y 40. Un slug válido = formato OK **y** no reservado. Queda listo para un futuro alta de barberías; hoy no hay formulario que lo use.
2. `/[slug]` trata reservados e inválidos como inexistentes: `page.tsx` y `generateMetadata` llaman a `validateSlug` **antes** de `getCachedBarbershop`, sin tocar la DB (el placeholder `__barberia__` ya es inválido por formato y puede seguir existiendo).
3. `src/proxy.ts` extiende el matcher con un patrón que solo matchea **un segmento sin punto** que no empiece con `_next`/`api` (p. ej. `"/:slug((?!_next|api)[^/.]+)"` o equivalente; el builder verifica con la doc la sintaxis exacta). Así `/`, `/_next/**`, `/api/**`, archivos estáticos (`favicon.ico`, `*.svg`, …) y rutas de más de un segmento (`/dashboard/**`) no pasan por este chequeo. Para ese path:
   - si el segmento es una ruta privada o `/login` → la lógica actual de sesión, sin cambios (no consulta la DB);
   - si `validateSlug` falla (formato o reservado) → 404 **sin consultar la DB**;
   - si es válido → consulta barata de existencia (`findUnique({ where: { slug }, select: { id: true } })`, índice único) en un módulo nuevo `src/server/queries/slug-exists.ts`; si no existe → 404; si existe → `NextResponse.next()`.
   - Si la consulta falla (DB caída) → fail-open con `NextResponse.next()`: la página decide (y loguea con `console.error`).
   - Cómo devolver el 404: preferentemente `NextResponse.rewrite` a una ruta que no matchea nada (de **dos** segmentos, p. ej. `/_not-found-slug/x`, para que no la capture `/[slug]`) de modo que se renderice el not-found global con status 404; si con `next start` eso no da 404 en el primer request, devolver `new NextResponse(<html mínimo en español>, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } })`. El builder documenta en `build.md` cuál usó y por qué.
   - La lógica de decisión tiene que ser pura y testeable (p. ej. extender `decideRoute` o una función `publicSlugFromPath(pathname): string | null` + decisión `{ action: "not-found" }`), con la consulta inyectada o importada de forma diferida (`await import(...)`) para que `src/proxy.test.ts` siga corriendo **sin** Prisma ni DB.
4. Coherencia: los segmentos de `PRIVATE_PREFIXES` tienen que estar en `RESERVED_SLUGS` (test).

**Trade-offs del enfoque**
- Costo: cada request a una página pública `/<slug>` (incluidos prefetch RSC y POST de la Server Action de reserva) hace 1 query indexada extra en Proxy. Los paths inválidos/reservados, el panel, `/login`, `/_next`, `/api` y los estáticos no consultan la DB. No se cachea en memoria (Proxy no debe depender de globals según la doc); si hiciera falta, es un seguimiento.
- Alternativas descartadas: prerenderizar todos los slugs con `generateStaticParams` (toca la DB en el build y no cubre slugs nuevos), sacar `cacheComponents`/hacer la ruta totalmente dinámica (la doc dice que el shell igual sale con 200 bajo Cache Components), y `notFound()` en la página (ya está y es lo que falla en el primer request).
- Proxy pasa a importar (de forma diferida) el cliente Prisma: hay que comprobar que `pnpm build` y `pnpm start` funcionen con Prisma en el bundle de Proxy (runtime Node).

## Criterios de aceptación
- **AC-1** `src/lib/slugs.test.ts` (Vitest): `validateSlug` acepta `barberia-demo`, `otra-barberia`, `abc`, `barberia-123`; rechaza (con `ok: false` y mensaje en español) `""`, `ab`, un string de 41 caracteres, `Barberia`, `barbería`, `-demo`, `demo-`, `de--mo`, `de mo`, `de_mo`, `de.mo`, `de/mo`, y **todos** los de `RESERVED_SLUGS` (incluidos `login`, `dashboard`, `api`, `_next`); `isReservedSlug("dashboard") === true`, `isReservedSlug("barberia-demo") === false`.
- **AC-2** Un test lee `prisma/seed.ts` y los scripts de smoke como texto (sin ejecutarlos ni editarlos), extrae los slugs (`slug: "..."` / `SLUG = "..."`) y verifica que hay al menos 2 y que todos pasan `validateSlug`. Otro test verifica que cada segmento de `PRIVATE_PREFIXES` (sin la barra) es reservado.
- **AC-3** `src/proxy.test.ts` sigue verde sin DB y cubre la decisión nueva: `/no-existe-xyz` con lookup `false` → not-found; `/barberia-demo` con lookup `true` → next; `/login`, `/dashboard`, `/api`, `/_next`, `/Barberia`, `/de--mo` → not-found **sin llamar** al lookup (o, para `/login`/`/dashboard`, la decisión de sesión de siempre); `/`, `/favicon.ico`, `/dashboard/cash`, `/_next/static/a.js`, `/api/x` → no aplica el chequeo de slug. Los tests existentes de `safeNextPath` y `decideRoute` no cambian de resultado.
- **AC-4** Con DB seedeada (`pnpm exec prisma db seed`), `pnpm build && pnpm start -p 3108` y `curl -s -o /dev/null -w "%{http_code}"` en un servidor **recién levantado** (primer request de cada URL): `/no-existe-xyz` → `404` (y un segundo request también `404`); `/admin` → `404`; `/barberia-demo` → `200` con el nombre de la barbería en el body; `/dashboard` sin cookie → `307` a `/login?next=%2Fdashboard`; `/login` → `200`; `/favicon.ico` → `200`. El body del 404 es la UI de "no encontrada" (no el shell de la barbería). Pegar la salida en `build.md`.
- **AC-5** Mismo servidor: el flujo público sigue funcionando: `/barberia-demo?service=...` muestra servicios/horarios como antes, y un `curl` con header `RSC: 1` a `/no-existe-otro` no devuelve 200. Logs del server sin errores de Prisma en Proxy.
- **AC-6** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `src/lib/slugs.ts`
- `src/lib/slugs.test.ts`
- `src/proxy.ts`
- `src/proxy.test.ts`
- `src/server/queries/slug-exists.ts`
- `src/app/[slug]/page.tsx`
- `src/app/[slug]/data.ts`
- `src/app/not-found.tsx`
- `src/app/[slug]/not-found.tsx`

## Fuera de alcance
- Formulario de alta o edición de barbería/slug, y cualquier cambio en `src/app/(dashboard)/**` (lo toca el job 007-dashboard-nav en paralelo).
- Editar `prisma/seed.ts`, los scripts de smoke o el schema; migraciones; constraint de formato en la DB.
- Cache en memoria del lookup en Proxy, rate limiting, redirects de slugs viejos, slugs case-insensitive (`/Barberia-Demo` → redirect).
- Cambiar la lógica de sesión/JWT, `safeNextPath` o las rutas privadas existentes.
- Dependencias nuevas.

## Riesgos
- **Auth:** toca `src/proxy.ts` (hot file de auth). El matcher nuevo no debe hacer que rutas privadas salteen el chequeo de sesión ni que `/login` cambie de comportamiento; escalar a humano.
- **Performance/disponibilidad:** Proxy pasa a consultar la DB en cada request a `/<slug>`; acotado por matcher y por la validación previa sin DB; si la DB falla, fail-open.
- **Datos de otros tenants:** ninguno nuevo (la consulta solo devuelve existencia, no campos).
- Dependencias nuevas, schema, dinero: ninguno.
