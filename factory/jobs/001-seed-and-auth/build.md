# Build: 001-seed-and-auth
**Rama:** factory/001-seed-and-auth · **Commit:** 9ed0daf · **Worktree:** .worktrees/001-seed-and-auth

## Qué cambió
- `package.json`: deps `jose` 6.2.18 y `server-only`; script `db:seed` (`prisma db seed`).
- `pnpm-lock.yaml`: lock de las dos deps nuevas.
- `prisma.config.ts`: `migrations.seed = "tsx prisma/seed.ts"`.
- `.env.example`: `SESSION_SECRET=` vacío con instrucción `openssl rand -base64 32` (mín. 32 caracteres).
- `prisma/seed.ts`: seed idempotente (borra y recrea solo `barberia-demo` y `otra-barberia`), turnos de la semana en curso en la TZ de la barbería, PRNG determinístico, hash scrypt con salt propio por usuario.
- `src/lib/password.ts`: `hashPassword` / `verifyPassword` con `scrypt` + `timingSafeEqual`; formato `scrypt$salt$key`; nunca lanza por hash malformado.
- `src/lib/password.test.ts`: tests de AC-2 (password).
- `src/lib/session.ts`: firma/verifica JWT HS256 (`jose`), sin DB; `getSessionSecret()` falla con error claro si falta `SESSION_SECRET`; opciones de cookie (httpOnly, lax, secure en prod, 7 días).
- `src/lib/session.test.ts`: tests de AC-2 (sesión) + error por secreto faltante.
- `src/lib/auth.ts`: DAL `server-only`: `getSession` (React `cache`, re-lee `User` en DB: existe, `active`, `barbershopId` == token; rol vigente sale de la DB), `requireSession`, `requireRole`, `createSession`, `deleteSession`.
- `src/proxy.ts`: chequeo optimista del JWT; `decideRoute` / `isPrivatePath` puras y exportadas; matcher solo sobre `/login` y las rutas privadas.
- `src/proxy.test.ts`: tests de la decisión de ruteo.
- `src/server/actions/auth.ts`: `login` (Zod → usuario por email → verify contra hash dummy si no existe, para igualar tiempos → cookie → redirect) y `logout`. Error genérico. Soporta `next` solo si es ruta interna (`/…`, no `//`).
- `src/app/(auth)/login/page.tsx` + `login-form.tsx`: Card con form (`useActionState`), `next` leído de `searchParams` dentro de `<Suspense>`.
- `src/app/(dashboard)/layout.tsx`: header (barbería, usuario, rol, "Cerrar sesión") con `requireSession()` dentro de `<Suspense>`.
- `src/app/(dashboard)/dashboard/page.tsx`: "Hola, <nombre>" + rol + barbería.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `pnpm exec prisma db seed` x4 → siempre `barberías=2 usuarios=5 servicios=8 clientes=18 turnos=171 horarios=14`. Script de verificación sobre la DB: 0 errores (todos dentro del horario, sin solapes por barbero, `endsAt = startsAt + duración`, pasados ∈ COMPLETED/NO_SHOW/CANCELLED, futuros ∈ PENDING/CONFIRMED). Barberos: 2× PERCENTAGE (50/40), 1× FIXED_RENT (120000); owner NONE. 7 servicios ($4.000–$35.000), 18 clientes con `+54911…` únicos. Nota: los turnos cubren lun–sáb de la semana en curso; el **domingo está `closed`**, así que no tiene turnos (respetar "dentro del horario de apertura" lo impide). |
| AC-2 | ✅ | `pnpm test`: password (4 tests) y session (5 tests: válido, alterado/firma rota/basura, vencido, otro secreto, secreto faltante) pasan. |
| AC-3 | ✅ | POST del form (no-JS) con owner → `303 Location: /dashboard`, `Set-Cookie: session=…; Path=/; Expires=+7d; HttpOnly; SameSite=lax`. `/dashboard` muestra "Hola, Carlos Benítez · Rol: OWNER · Barbería Demo"; con `nico@` → "Rol: BARBER". Password incorrecto, email inexistente y usuario `active=false` → 200 con "Email o contraseña incorrectos" y sin `Set-Cookie`. |
| AC-4 | ✅ | `curl -i :3001/dashboard` → `307 location: /login?next=%2Fdashboard`; con cookie alterada → igual. `/login` con sesión válida → `307 /dashboard`. `GET /` → 200, `GET /barberia-demo` → 404 (no hay página aún) sin redirect del proxy. `decideRoute` cubierto en `src/proxy.test.ts`. |
| AC-5 | ✅ | Con JWT válido: user `active=false` → layout emite redirect a `/login`; user movido a otra barbería → redirect a `/login`; user borrado → redirect a `/login`. `owner@otra-barberia.test` ve "Otra Barbería (otra-barberia)" y ninguna ocurrencia de "Barbería Demo". `requireRole("OWNER")` probado con una página temporal (borrada, no commiteada): OWNER la ve, BARBER → redirect a `/dashboard`. `barbershopId` solo sale del JWT verificado + DB. |
| AC-6 | ✅ | POST de "Cerrar sesión" → `303 /login` + `Set-Cookie: session=; Expires=1970` ; después `/dashboard` sin cookie → `307 /login?next=%2Fdashboard`. |
| AC-7 | ✅ | `SESSION_SECRET` en `.env.example` con instrucción. `getSessionSecret()` lanza "Falta SESSION_SECRET (mínimo 32 caracteres). Generalo con `openssl rand -base64 32`…" (test). `SESSION_SECRET= DATABASE_URL=<inválida> pnpm build` → OK. |
| AC-8 | ✅ | ver Checks. |

## Checks
lint ✅ · typecheck ✅ · test ✅ (4 archivos, 15 tests) · build ✅ (sin secreto ni DB reales)

## Notas
- El `.env` local del worktree tiene un `SESSION_SECRET` generado (no versionado).
- La sesión es JWT sin estado: tras logout, un token copiado sigue siendo válido hasta vencer, pero se revoca en el servidor desactivando al usuario o cambiándole la barbería (tabla de sesiones fuera de alcance).
- En `next dev` aparecen warnings de "Missing `origin` header" que vinieron de mis pruebas con `fetch` desde Node, no de la app.

## Respuesta a la ronda 1
Commit `9ed0daf`. Checks: lint ✅ · typecheck ✅ · test ✅ (4 archivos, 17 tests) · build ✅ (sin secreto ni DB reales).
- security [blocking]: open redirect en `safeNext` → `safeNextPath` en `src/proxy.ts` (pura, usada por `login`): resuelve `next` con `new URL(next, "http://internal.invalid")`, exige mismo origen **y** `isPrivatePath`, devuelve `pathname + search`; si no, `/dashboard`. Hay tests en `src/proxy.test.ts` para `/\t/evil.com`, `/%09/evil.com`, `/\n/…`, `/%0A/…`, `/\r/…`, `//evil.com`, `/\evil.com`, `/\/evil.com`, `\evil.com`, `https://evil.com`, `http:/evil.com`, `javascript:`, rutas públicas, vacío/null, y para los casos válidos (`/cash/…?x=1`). E2E en dev (:3001): login con `next` = tab, `%09`, `//evil.com` y `https://evil.com` → `Location: /dashboard`; `/cash?x=1` → `/cash?x=1`.
- security [nit] rate limit: fuera de alcance; dejé un `TODO(job posterior)` en `login` (límite por IP + email).
- security [nit] JWT sin estado tras logout: sin cambios (tabla de sesiones / `sessionVersion` fuera de alcance, ya documentado en Notas).
- security [nit] secreto evaluado fuera del `try`: es a propósito (AC-7); ahora está documentado en el JSDoc de `verifySession`.
- ui [nit] botón "Cerrar sesión" que se comprime → `<form className="shrink-0">`.
- ui [nit] Badge con el rol crudo → muestra `Dueño/a` / `Barbero/a` (el dashboard sigue mostrando `OWNER`/`BARBER` porque lo pide AC-3).
- ui/ux [nit] copy técnico del dashboard: lo dejo así; es un placeholder y AC-3 pide mostrar el rol. Se cambia cuando se arme el panel real.
- ux [nit] objetivos táctiles de 40px → inputs y "Ingresar" en `h-11`; "Cerrar sesión" en `h-11 min-w-11`, y en mobile queda solo el ícono (texto `max-sm:sr-only` + `aria-label`).
- ux [nit] email/a11y → `autoCapitalize="none"`, `spellCheck={false}`, y `aria-invalid` + `aria-describedby="login-error"` en los inputs cuando hay error.
- code [nits]: sin acción (el reviewer no pidió cambios).
