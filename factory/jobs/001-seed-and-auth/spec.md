# Seed de demo + login por roles con sesión multi-tenant

**Pedido:** Seed de datos realistas (una barbería con 3 barberos, servicios, clientes y turnos de la semana) + login por roles (OWNER / BARBER) y sesión multi-tenant verificada en servidor y en `proxy.ts`.

## Contexto
Hoy existen el schema completo (`prisma/schema.prisma`, migración `20261120000000_init`), el cliente `db` en `src/lib/db.ts`,
`src/lib/time.ts` (helpers de timezone) y una home estática en `src/app/page.tsx`. No hay seed, ni auth, ni `src/proxy.ts`,
ni rutas `(auth)` / `(dashboard)`. Modelos usados: `Barbershop`, `OpeningHours`, `User` (`email` único, `passwordHash`,
`role: OWNER|BARBER`, `active`, `payoutScheme`, `payoutValue`), `Service`, `Customer`, `Appointment`.

Diseño esperado (el builder puede ajustar detalles, no la forma):
- **Seed** en `prisma/seed.ts`, cableado vía Prisma 7: `migrations.seed` en `prisma.config.ts` (p. ej. `"tsx prisma/seed.ts"`)
  y script `"db:seed": "prisma db seed"` en `package.json`. Crea su propio `PrismaClient` con `PrismaPg` (mismo patrón que `db.ts`).
  Idempotente: borra y recrea los datos de los tenants del seed (por `slug`) en cada corrida.
- **Contraseñas:** hash con `scrypt` de `node:crypto` (salt aleatorio, comparación con `timingSafeEqual`) en `src/lib/password.ts`. Sin dependencia nueva.
- **Sesión:** cookie `session` (httpOnly, `sameSite=lax`, `secure` en producción, 7 días) con un JWT HS256 firmado con `jose`
  usando `SESSION_SECRET`. Payload: `{ userId, barbershopId, role, expiresAt }`. `src/lib/session.ts` solo firma/verifica
  (sin DB, importable desde el proxy).
- **DAL** en `src/lib/auth.ts` (`import "server-only"`): `getSession()` (lee cookie, verifica JWT y **re-lee el `User` en la DB**
  comprobando `active` y que su `barbershopId` coincida con el del token; memoizado con `React.cache`), `requireSession()`
  (redirige a `/login` si no hay) y `requireRole(role)`. Es la fuente de verdad del `barbershopId` para todos los jobs siguientes.
- **Acciones** `login` / `logout` en `src/server/actions/auth.ts`: Zod `safeParse` → buscar usuario por email → verificar hash →
  crear cookie → `redirect("/dashboard")`. Error genérico ("Email o contraseña incorrectos") sin revelar cuál falló.
- **Proxy** `src/proxy.ts`: chequeo optimista (solo verifica el JWT, sin DB). Rutas privadas: `/dashboard`, `/settings`,
  `/services`, `/today`, `/cash` (y sus subrutas) → sin sesión válida redirige a `/login?next=<ruta>`. `/login` con sesión válida
  → redirige a `/dashboard`. Todo lo demás (incluido `/[slug]` público, `/_next`, assets, `/api`) pasa sin tocar.
- **UI mínima:** `src/app/(auth)/login/page.tsx` (form shadcn con `Input`/`Label`/`Button`/`Card`, hoja `"use client"` con
  `useActionState`, textos en vos). `src/app/(dashboard)/layout.tsx` (llama `requireSession()` dentro de `<Suspense>`, header con
  nombre de la barbería, nombre y rol del usuario y botón "Cerrar sesión") y `src/app/(dashboard)/dashboard/page.tsx`
  ("Hola, <nombre>" + rol). Nada más: el panel real lo construyen los jobs 002–006.

Docs de Next 16 a leer (en `node_modules/next/dist/docs/01-app/`): `01-getting-started/16-proxy.md`,
`02-guides/authentication.md`, `02-guides/authentication-with-cache-components.md`, `02-guides/data-security.md`,
`01-getting-started/07-mutating-data.md`, `01-getting-started/08-caching.md` (con `cacheComponents: true`, leer cookies/sesión
solo dentro de `<Suspense>`).

## Criterios de aceptación
- **AC-1 Seed.** Con la base migrada, `pnpm exec prisma db seed` termina sin error y dos corridas seguidas dejan los mismos conteos.
  Crea la barbería `slug = "barberia-demo"` (timezone `America/Argentina/Buenos_Aires`, dirección/WhatsApp/descripción
  realistas, `OpeningHours` para los 7 días con domingo `closed`), 1 OWNER (`owner@barberia-demo.test`, `payoutScheme NONE`)
  y 3 BARBER (`*@barberia-demo.test`, al menos uno `PERCENTAGE` y uno `FIXED_RENT`), ≥ 6 servicios con precios ARS realistas
  y duraciones, ≥ 15 clientes con teléfonos argentinos únicos, y turnos para los 7 días de la semana en curso (calculada en la
  timezone de la barbería): dentro del horario de apertura, sin solaparse por barbero, `endsAt = startsAt + duración`, pasados en
  `COMPLETED`/`NO_SHOW`/`CANCELLED` y futuros en `PENDING`/`CONFIRMED`. Crea además una segunda barbería mínima
  `slug = "otra-barberia"` con 1 OWNER (`owner@otra-barberia.test`) para probar aislamiento. Todos los usuarios del seed usan la
  contraseña `barber123` (hasheada), documentada en un comentario al principio de `seed.ts`.
- **AC-2 Password y sesión (Vitest).** `src/lib/password.test.ts`: hash ≠ texto plano, dos hashes del mismo password difieren,
  `verifyPassword` acepta el correcto y rechaza el incorrecto y un hash malformado. `src/lib/session.test.ts`: un token firmado
  se verifica y devuelve `{ userId, barbershopId, role }`; un token alterado, uno vencido y uno firmado con otro secreto devuelven `null`.
- **AC-3 Login.** En `/login`, `owner@barberia-demo.test` / `barber123` redirige a `/dashboard`, que muestra el nombre del usuario,
  rol OWNER y "Barbería Demo" (o el nombre sembrado); un BARBER ve su rol BARBER. Credenciales incorrectas o usuario `active=false`
  muestran el error genérico y no setean cookie. La cookie `session` es httpOnly y `sameSite=lax`.
- **AC-4 Proxy.** Sin cookie, `curl -i http://localhost:<port>/dashboard` responde redirect a `/login?next=%2Fdashboard`; igual con una
  cookie `session` alterada. Con sesión válida, `GET /login` redirige a `/dashboard`. `GET /barberia-demo` y `GET /` no son
  redirigidos por el proxy. La decisión de ruteo es testeable (función pura exportada o test en `src/proxy.test.ts`).
- **AC-5 Verificación en servidor / multi-tenant.** `getSession()` devuelve `null` (y el layout de `(dashboard)` redirige a `/login`)
  si el usuario del token no existe, está `active=false` o su `barbershopId` ya no coincide con el del token, aunque el JWT sea
  válido. Logueado como `owner@otra-barberia.test`, `/dashboard` muestra "otra-barberia" y ningún dato de `barberia-demo`.
  `requireRole("OWNER")` redirige/lanza para un BARBER. `barbershopId` nunca se lee de input del cliente.
- **AC-6 Logout.** "Cerrar sesión" borra la cookie y lleva a `/login`; después `/dashboard` vuelve a redirigir a `/login`.
- **AC-7 Config.** `SESSION_SECRET` figura en `.env.example` (con instrucción para generarlo) y la app falla con un error claro
  si falta en runtime de servidor (pero `pnpm build` no requiere la base ni el secreto reales).
- **AC-8** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `prisma/seed.ts`
- `prisma.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `.env.example`
- `src/lib/auth.ts`
- `src/lib/session.ts`
- `src/lib/session.test.ts`
- `src/lib/password.ts`
- `src/lib/password.test.ts`
- `src/proxy.ts`
- `src/proxy.test.ts`
- `src/server/actions/auth.ts`
- `src/app/(auth)/**`
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/dashboard/**`

## Fuera de alcance
- Registro / alta de barberías, invitación de barberos, recuperación de contraseña, OAuth o magic links.
- Tabla de sesiones en DB o cambios de `prisma/schema.prisma` / migraciones.
- Navegación o secciones reales del panel (settings, services, today, cash) y cualquier cosa en `src/app/[slug]/**`,
  `src/lib/slots.ts` o `src/server/actions/booking.ts` (job 004).
- Tocar `src/app/page.tsx`, `src/app/layout.tsx`, `src/lib/db.ts` o agregar componentes de shadcn nuevos (usar los existentes).
- Rate limiting de login.

## Riesgos
- **Auth:** es la base de seguridad de todo el producto; el proxy es solo optimista, la autorización real está en `auth.ts` (DAL).
- **Datos de otros tenants:** `barbershopId` sale únicamente de la sesión verificada contra la DB.
- **Dependencias nuevas:** `jose` y `server-only` (`package.json` + `pnpm-lock.yaml`, hot files).
- **Seed destructivo:** borra y recrea solo los tenants con slug `barberia-demo` y `otra-barberia`; nunca otros datos.
- **Colisión de rutas:** las rutas privadas (`/dashboard`, `/settings`, …) quedan reservadas y no pueden usarse como `slug` público.
