# Panel de administración de la plataforma

**Pedido:** "Quiero un panel administrador para poder administrar el SaaS."

## Contexto
- Hoy no hay ningún rol por encima de las barberías. `User` (`prisma/schema.prisma`) siempre pertenece a un
  `Barbershop` (`role` OWNER/BARBER, `passwordHash String?`, `email @unique` global). `Barbershop` no tiene estado ni
  plan. `Invitation` (job 017): `tokenHash @unique`, `expiresAt`, `usedAt`, siempre del mismo `barbershopId` que su
  usuario.
- Sesión del panel: `src/lib/session.ts` (JWT HS256 con `SESSION_SECRET`, cookie `session`, 7 días, payload
  `userId/barbershopId/role/expiresAt`, sin DB, lo importa el proxy) y `src/lib/auth.ts` (DAL: `getSession` re-lee el
  `User` y su `barbershop` en la DB; `requireSession` → `/login`). `login` (`src/server/actions/auth.ts`) usa
  `DUMMY_HASH` + error genérico. Contraseñas: `src/lib/password.ts` (`hashPassword`/`verifyPassword`, scrypt).
- Invitaciones (job 017): `src/lib/invitations.ts` (token, hash, TTL 48 h, `whatsappInviteUrl`, `invitationPath`),
  `createBarber`/`regenerateInvitation` en `src/server/actions/barbers.ts`, `getUsableInvitation` en
  `src/server/queries/barbers.ts` y `acceptInvitation` en `src/server/actions/invitations.ts`. **Hoy las dos últimas
  exigen `user.passwordHash === null`.** Por eso el reset de acceso del dueño necesita distinguir el tipo de link.
- Proxy (`src/proxy.ts` + `src/proxy.test.ts`): `admin` ya está en `RESERVED_SLUGS` (verificado). Por eso hoy `/admin`
  (un segmento) entra por el matcher `/:slug` y `decidePublicSlug` lo reescribe a 404. `/admin/**` (dos o más
  segmentos) no entra en el matcher. Las rutas de admin se tienen que resolver **antes** del chequeo de slug.
- Landing pública: `src/app/[slug]/data.ts` cachea `getPublicBarbershop`/`getPublicLanding` con
  `cacheTag(barbershopBrandingTag(slug))`. `page.tsx` hace `notFound()` si alguna devuelve `null`.
  `barbershopSlugExists` (`src/server/queries/slug-exists.ts`) resuelve el 404 del proxy. La reserva entra por
  `createPublicBooking` (`src/server/booking.ts`) → `resolveBarbershop(slug)`. `getOnlineServices`,
  `getAvailableSlots` y `getPublicOpeningHours` también resuelven el tenant por slug. El `not-found` global ya dice
  "la barbería ya no está disponible".
- Layout del panel: `src/app/(dashboard)/layout.tsx` (`SessionHeader` dentro de `<Suspense>`). Componentes de shadcn
  disponibles: badge, button, card, input, label. **No se agregan componentes nuevos** (las tablas se arman con
  `<table>` y tokens).
- Los scripts corren con `pnpm exec tsx scripts/<x>.ts` y `import "dotenv/config"` (ver `scripts/booking-smoke.ts`).
  No pueden importar módulos con `server-only`.
- Docs de Next 16 que tiene que leer el builder (`node_modules/next/dist/docs/01-app/`): `02-guides/authentication.md`,
  `02-guides/authentication-with-cache-components.md`, `02-guides/data-security.md`, `02-guides/server-actions.md`,
  `02-guides/forms.md`, `01-getting-started/08-caching.md` (`cacheComponents: true`: cookies, sesión, `searchParams`
  y DB van dentro de `<Suspense>`; `updateTag` desde Server Actions) y `01-getting-started/16-proxy.md`.

## Criterios de aceptación
- **AC-1 Schema y migración.** Una sola migración nueva en `prisma/migrations/` que agrega:
  - el modelo `PlatformAdmin` (`id`, `email @unique`, `name`, `passwordHash`, `createdAt`, `lastLoginAt DateTime?`),
    sin relación con `Barbershop` ni `User`;
  - los enums `BarbershopStatus { ACTIVE SUSPENDED }` y `Plan { FREE BASIC PRO }`;
  - en `Barbershop`: `status` (default `ACTIVE`), `plan` (default `FREE`) y `planExpiresAt DateTime?`;
  - en `User`: `lastLoginAt DateTime?`, que se setea en `login` y al aceptar una invitación;
  - en `Invitation`: `kind` enum `INVITE | RESET` (default `INVITE`).

  Las filas que ya existen quedan ACTIVE / FREE / INVITE y no se borra nada. La lógica pura va en
  `src/lib/platform-admin.ts` (sin Prisma ni Next) y se testea en `src/lib/platform-admin.test.ts`:
  - los schemas Zod de crear y editar barbería (el slug se valida con `validateSlug`, el email con trim y minúsculas,
    el plan es el enum y la fecha es opcional);
  - `planBanner(planExpiresAt, now, timeZone)`, que devuelve `none` (null o faltan más de 7 días), `expiring` (faltan
    7 días o menos; en el borde de 7 días exactos ya es `expiring`) o `expired` (ya pasó), con la fecha formateada en
    la timezone;
  - `monthRange(now, timeZone)`: el inicio y el fin del mes de negocio en UTC y como `businessDate`. Tiene un caso de
    borde: el 1 de mes a las 00:30 en Buenos Aires sigue siendo el mes anterior en UTC;
  - `lastActivity(...)`: el máximo de las fechas que no son null;
  - `generateAdminPassword()`: al menos 20 caracteres y que no se repita;
  - los 7 `OpeningHours` por defecto: weekday 0 `closed: true` y weekdays 1–6 de 10:00 a 20:00.
- **AC-2 Cuenta y sesión de admin separadas.**
  - `scripts/create-admin.ts` (script `admin:create` en `package.json`; se corre
    `pnpm admin:create --email a@b.com --name "X"`) crea un `PlatformAdmin` con `hashPassword` e imprime **una sola
    vez** la contraseña generada. Si el email ya existe, falla con un código distinto de 0 y no la pisa.
  - `/admin/login` tiene email y contraseña con error genérico ("Email o contraseña incorrectos"), `DUMMY_HASH` cuando
    el email no existe y actualiza `lastLoginAt`. Hay un "Cerrar sesión".
  - La cookie es `admin_session`: httpOnly, `secure` en producción, `sameSite: "strict"`, `path: "/"`, 12 h.
  - El JWT del admin (`src/lib/admin-session.ts`, puro e importable desde el proxy) lleva `adminId` y el audience
    `platform-admin`. `verifyAdminSession` exige ese audience, y `verifySession` (`src/lib/session.ts`) rechaza
    cualquier token que tenga ese audience. Tests en `src/lib/admin-session.test.ts` y `src/lib/session.test.ts`: un
    token de barbería no pasa `verifyAdminSession`, un token de admin no pasa `verifySession`, y un token vencido o
    con otra firma da `null`.
  - El DAL `src/lib/admin-auth.ts` (`server-only`: `getAdminSession`/`requireAdminSession`) re-lee el `PlatformAdmin`
    en la DB.
  - Toda página bajo `/admin/**` salvo `/admin/login` llama a `requireAdminSession()` en el servidor. Toda Server
    Action de `src/server/actions/admin.ts` hace Zod `safeParse` → `getAdminSession()` (sin sesión: error/redirect,
    sin tocar nada) → query.
  - La sesión de una barbería (OWNER incluido) no da acceso a `/admin`, y la de admin no da acceso a `/dashboard`.
- **AC-3 Proxy.** `decideRoute` (o una función pura nueva, como `decideAdminRoute`) cubre lo siguiente, y el proxy
  la aplica **antes** de `decidePublicSlug`:
  - `/admin` y `/admin/**` sin una cookie de admin válida → redirect a `/admin/login`;
  - `/admin/login` con una cookie de admin válida → `/admin`;
  - `/admin` deja de reescribirse a 404.

  El matcher incluye `/admin` y `/admin/:path*`. Casos nuevos en `src/proxy.test.ts`: los anteriores, más una cookie
  de barbería en `/admin/barbershops` (→ `/admin/login`) y `decidePublicSlug("/admin")`, que sigue dando
  `not-found` (`admin` sigue reservado). Este redirect es solo UX: la autorización real es la de AC-2.
- **AC-4 Listado con métricas.** `/admin` muestra una tabla densa (desktop-first, con scroll horizontal en mobile) con
  todas las barberías. Columnas:
  - nombre;
  - slug, con link a `/<slug>` en una pestaña nueva;
  - estado (badge);
  - plan + vencimiento;
  - barberos activos (`User` con `role: BARBER`, `active: true` y `passwordHash` no null);
  - turnos del mes (`Appointment.startsAt` dentro de `monthRange`);
  - cortes del mes (`ServiceRecord.businessDate` dentro del mes);
  - última actividad (`lastActivity` del máximo `ServiceRecord.createdAt`, `Appointment.createdAt` y
    `User.lastLoginAt`).

  Hay un buscador `?q=` por nombre o slug (`contains`, `mode: "insensitive"`). Las lecturas van en
  `src/server/queries/admin.ts`, con una cantidad **constante** de queries sin importar cuántas barberías haya: un
  `findMany` más `groupBy`/`_count`/`_max` por `barbershopId`, nunca una query por fila. Hay que demostrarlo en
  `build.md`, con el código o con un log de queries de Prisma, sobre un seed de 3 barberías o más.
- **AC-5 Crear barbería.** `/admin/barbershops/new` pide nombre, slug, nombre del dueño y email del dueño. La action
  valida el slug con `validateSlug` y la unicidad (chequeo previo + `P2002`). Si el slug o el email ya existen,
  responde con errores genéricos ("Ese slug no está disponible." / "Ese email no está disponible.") y no crea nada.
  En **una transacción** crea:
  - el `Barbershop` (timezone `America/Argentina/Buenos_Aires`, ACTIVE, FREE);
  - los 7 `OpeningHours` por defecto (AC-1);
  - el `User` OWNER con `passwordHash: null`;
  - una `Invitation` `INVITE`, con la lógica de `src/lib/invitations.ts` (solo se guarda el hash, 48 h).

  El link `/invitacion/<token>` se muestra **una sola vez** con los botones "Copiar" y "Enviar por WhatsApp" (el
  mismo patrón que en el job 017; la URL absoluta sale de `window.location.origin`). Si el dueño lo acepta, elige su
  contraseña y entra a `/dashboard`.
- **AC-6 Editar, plan y nuevo link de acceso.** `/admin/barbershops/[id]` permite:
  - Editar el nombre y el slug (validado y único). Al guardar se llama a `updateTag(barbershopBrandingTag(slug))` con
    el slug viejo **y** con el nuevo.
  - Editar el email del dueño (el `User` OWNER de esa barbería). Es único entre todos los usuarios y el error es
    genérico.
  - Editar el plan (FREE/BASIC/PRO) y `planExpiresAt` (fecha opcional, se puede borrar).
  - Usar el botón **"Nuevo link de acceso para el dueño"**. En una transacción invalida (con `usedAt`) las
    invitaciones sin usar de ese OWNER y crea una `Invitation` `RESET`. El link se muestra una vez, igual que en AC-5,
    **aunque el dueño ya tenga contraseña**.

  `acceptInvitation` y `getUsableInvitation` aceptan un `RESET` con `passwordHash` no null. Un `INVITE` sigue
  exigiendo `passwordHash === null`, así que el flujo del job 017 queda igual. El `RESET` sigue siendo de un solo uso
  (`updateMany` con `usedAt: null`), pisa el `passwordHash` y crea la sesión. Para un `RESET`, la página dice
  "Elegí una nueva contraseña". Un `id` inexistente da `notFound()`.
- **AC-7 Suspender / reactivar.** Desde el detalle se puede suspender o reactivar la barbería. Solo cambia `status`,
  no se borra nada, y se llama a `updateTag(barbershopBrandingTag(slug))`. Con la barbería en SUSPENDED:
  - `login` rechaza a sus usuarios con "Tu barbería está suspendida. Contactá al administrador." (solo después de
    verificar bien la contraseña: si no, el error sigue siendo el genérico).
  - `getSession` (`src/lib/auth.ts`) devuelve `null` para las sesiones que ya existen, y `requireSession` las lleva a
    `/login`, donde se ve ese mismo mensaje. **No puede haber loop de redirects** entre `/login` (el proxy ve un JWT
    válido) y `/dashboard`. El mecanismo queda a elección del builder y se cubre con un test del proxy o de la
    función pura.
  - `acceptInvitation` rechaza los links de esa barbería.
  - `/<slug>` responde **404** (verificar con `curl -s -o /dev/null -w "%{http_code}"`): `barbershopSlugExists`,
    `getPublicBarbershop`, `getPublicLanding`, `getOnlineServices` y `getPublicOpeningHours` solo resuelven barberías
    ACTIVE. El HTML no tiene el nombre, los servicios ni los datos de contacto, y muestra el texto de "no disponible"
    que ya tiene el not-found global. Se eligió 404 y no 410 porque la suspensión es reversible (410 significa "Gone"
    permanente y los buscadores lo tratan así), porque el patrón actual (rewrite del proxy + `notFound()` antes del
    streaming) solo produce 404, y porque así no se revela si la barbería existe y está suspendida o si nunca existió.
  - `createPublicBooking` (`resolveBarbershop` filtra por ACTIVE) devuelve error y no crea ningún turno, aunque el
    POST llegue directo. Se agrega un chequeo a `scripts/booking-smoke.ts` o un test.

  Al reactivar, todo vuelve a funcionar sin pasos manuales.
- **AC-8 Banner de plan y checks.**
  - En `src/app/(dashboard)/layout.tsx`, el OWNER ve un banner según `planBanner`, con la fecha en la timezone de la
    barbería: `expiring` → "Tu plan vence el dd/mm/aaaa." y `expired` → "Tu plan venció el dd/mm/aaaa, contactá al
    administrador.". Con `none` no se ve nada. El vencimiento **no** bloquea ninguna función.
  - Para eso, `getSession` suma `status`, `plan` y `planExpiresAt` al `select` de `barbershop`. Las queries de las
    barberías siguen filtrando por el `barbershopId` de la sesión, sin cambios.
  - La UI de `/admin` es sobria y densa, usa los tokens de shadcn (no el estilo urbano de la landing) y los textos
    están en español rioplatense.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `package.json`
- `scripts/create-admin.ts`
- `scripts/booking-smoke.ts`
- `src/proxy.ts`
- `src/proxy.test.ts`
- `src/lib/auth.ts`
- `src/lib/session.ts`
- `src/lib/session.test.ts`
- `src/lib/admin-session.ts`
- `src/lib/admin-session.test.ts`
- `src/lib/admin-auth.ts`
- `src/lib/platform-admin.ts`
- `src/lib/platform-admin.test.ts`
- `src/server/actions/admin.ts`
- `src/server/actions/auth.ts`
- `src/server/actions/invitations.ts`
- `src/server/queries/admin.ts`
- `src/server/queries/barbers.ts`
- `src/server/queries/booking.ts`
- `src/server/queries/landing.ts`
- `src/server/queries/slug-exists.ts`
- `src/server/booking.ts`
- `src/app/admin/**`
- `src/app/(auth)/login/**`
- `src/app/(auth)/invitacion/**`
- `src/app/(dashboard)/layout.tsx`
- `src/app/[slug]/data.ts`
- `src/app/[slug]/page.tsx`

## Fuera de alcance
- Cobros o integración de pagos, y bloquear funciones por plan vencido o por tipo de plan (solo se muestra el banner).
- Borrar barberías o usuarios, impersonar ("entrar como") a una barbería y editar datos internos de una barbería desde
  el admin (servicios, turnos, cortes, barberos).
- Alta, baja o edición de admins desde la UI (solo el script), 2FA, recuperar la contraseña del admin, rate limiting
  de `/admin/login` y log de auditoría.
- Invalidar los JWT de barbería que ya están emitidos al hacer un RESET o un cambio de contraseña. La suspensión sí
  corta las sesiones, vía `getSession`.
- Mandar emails o usar la API de WhatsApp (solo `wa.me` sin teléfono). Agregar variables de entorno nuevas
  (`ADMIN_SECRET`, `APP_URL`), dependencias o componentes de shadcn.
- Cambiar `RESERVED_SLUGS` (`admin` ya está), el diseño de la landing o el texto del not-found global.

## Riesgos
- **Auth (crítico):** se agrega un nivel de privilegio que ve y modifica todos los tenants. La separación de sesiones
  (audience distinto y rechazo cruzado en los dos verificadores), el chequeo server-side en cada página y action de
  `/admin`, y que la contraseña del admin solo exista hasheada (se imprime una vez y no se loguea) tienen que
  revisarse a mano. El RESET deja que alguien con el link tome la cuenta del dueño: el link es de un solo uso, vence
  en 48 h, solo se guarda hasheado y solo se ve una vez.
- **Suspensión:** rechazar en `getSession` afecta a todo el panel. Hay riesgo de loop de redirects `/login` ↔
  `/dashboard` y de dejar abierto algún camino público por slug (reserva, servicios, horarios, metadata cacheada).
  Hace falta invalidar el cache (`updateTag`) al cambiar el estado o el slug.
- **Multi-tenant:** el admin ve todo a propósito. Del lado de las barberías no cambia el aislamiento por
  `barbershopId`, y el `select` nuevo de `getSession` no expone nada de otros tenants.
- **Schema y migración:** se tocan los hot files `prisma/schema.prisma` y `prisma/migrations/**`, más `src/proxy.ts`,
  `src/lib/auth.ts` y `package.json` (solo el script, sin dependencias). El job corre solo y se escala a un humano.
- **Emails y slugs únicos:** los errores tienen que ser genéricos para no revelar qué existe.
- **Dependencias nuevas:** ninguna.
