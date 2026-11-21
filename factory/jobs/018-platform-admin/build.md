# Build: 018-platform-admin
**Rama:** factory/018-platform-admin · **Commit:** f1a1e2d · **Worktree:** .worktrees/018-platform-admin

## Qué cambió
- `prisma/schema.prisma`: modelo `PlatformAdmin` (sin relaciones), enums `BarbershopStatus`, `Plan`, `InvitationKind`; `Barbershop.status/plan/planExpiresAt`, `User.lastLoginAt`, `Invitation.kind`.
- `prisma/migrations/20261121171035_platform_admin/migration.sql`: la única migración nueva. Solo `ADD COLUMN` con defaults (ACTIVE / FREE / INVITE) y `CREATE TABLE`; no borra nada.
- `package.json`: script `admin:create` (sin dependencias nuevas).
- `scripts/create-admin.ts`: crea un `PlatformAdmin` con `hashPassword`, imprime la contraseña una sola vez, sale con código 1 si el email existe (2 si los argumentos son inválidos).
- `scripts/booking-smoke.ts`: chequeos de barbería suspendida (reserva directa, slots, datos públicos, slug) y de reactivación.
- `src/lib/platform-admin.ts` (+ `.test.ts`): schemas Zod de crear y editar, `planBanner`/`planBannerMessage`/`planExpiresAtFromDate`, `monthRange`, `lastActivity`, `generateAdminPassword`, `defaultOpeningHours`, `invitationAllowsUser` (reglas INVITE/RESET/suspendida) y los mensajes genéricos.
- `src/lib/admin-session.ts` (+ `.test.ts`): JWT de admin (`adminId`, audience `platform-admin`, mismo `SESSION_SECRET`); cookie `admin_session` httpOnly, strict, path `/`, secure en producción, 12 h.
- `src/lib/session.ts`: `verifySession` rechaza cualquier token que tenga `aud`.
- `src/lib/session.test.ts`: casos nuevos para un token de admin y para un payload de barbería que trae el audience de admin.
- `src/lib/admin-auth.ts`: DAL `server-only` (`getAdminSession` re-lee `PlatformAdmin`, `requireAdminSession` manda a `/admin/login`, crear y borrar la cookie).
- `src/lib/auth.ts`: `getSession` agrega `status/plan/planExpiresAt` al select y da `null` si la barbería no está ACTIVE. `requireSession` manda a `/login?suspended=1` cuando la causa es la suspensión.
- `src/proxy.ts`: `isAdminPath`, `decideAdminRoute`, `decideAdminRequest` (se aplican antes de `decidePublicSlug`), `isSuspendedNotice` (`/login?suspended=1` no rebota a `/dashboard`), y el matcher con `/admin` y `/admin/:path*`.
- `src/proxy.test.ts`: casos de `/admin` (con los JWT reales y los cruces de cookie), `decidePublicSlug("/admin")`, el matcher y el recorrido anti-loop de la suspensión.
- `src/server/actions/admin.ts`: `adminLogin`/`adminLogout`, `createBarbershop`, `updateBarbershop`, `setBarbershopStatus`, `createOwnerAccessLink`.
- `src/server/actions/auth.ts`: `login` setea `lastLoginAt` y rechaza una barbería suspendida, solo después de que la contraseña verificó.
- `src/server/actions/invitations.ts`: acepta un RESET aunque el usuario tenga contraseña (el INVITE sigue exigiendo `passwordHash: null`), rechaza la barbería suspendida y setea `lastLoginAt`.
- `src/server/queries/admin.ts`: `listBarbershopsWithMetrics` (cantidad constante de queries) y `getBarbershopForAdmin`.
- `src/server/queries/barbers.ts`: `getUsableInvitation` usa `invitationAllowsUser` y devuelve `kind`.
- `src/server/queries/booking.ts`: `getPublicBarbershop`, `resolveBarbershop` (y por lo tanto `createPublicBooking` y `getAvailableSlots`) y `getOnlineServices` filtran `status: "ACTIVE"`.
- `src/server/queries/landing.ts`: `getPublicLanding` y `getPublicOpeningHours` filtran `status: "ACTIVE"`.
- `src/server/queries/slug-exists.ts`: solo resuelve barberías ACTIVE (con una suspendida, el proxy da 404).
- `src/app/admin/login/{page,login-form}.tsx`: login de admin.
- `src/app/admin/(panel)/layout.tsx`: header con el email del admin y "Cerrar sesión".
- `src/app/admin/(panel)/page.tsx`: tabla de barberías con buscador `?q=`.
- `src/app/admin/(panel)/barbershops/new/{page,create-form}.tsx`: alta de barbería.
- `src/app/admin/(panel)/barbershops/[id]/{page,edit-form,status-form,access-link-form}.tsx`: detalle, edición, suspender/reactivar y nuevo link de acceso.
- `src/app/admin/(panel)/{field,format,status-badge}.tsx|ts`: helpers de UI del admin.
- `src/app/(auth)/login/page.tsx`: con `?suspended=1` muestra "Tu barbería está suspendida. Contactá al administrador.".
- `src/app/(auth)/invitacion/[token]/{page,accept-form}.tsx`: para un RESET muestra "Elegí una nueva contraseña".
- `src/app/(dashboard)/layout.tsx`: banner de plan para el OWNER.

Importo sin modificarlos (los dos quedan fuera del scope): `InviteLink` de `src/app/(dashboard)/dashboard/barbers/invite-link.tsx` (el mismo patrón de Copiar/WhatsApp con `window.location.origin` que en el job 017) y `FieldError/FormStatus/nativeFieldClass` de `settings/form-ui.tsx`. `src/app/[slug]/data.ts` y `src/app/[slug]/page.tsx` no necesitaron cambios: el filtro por ACTIVE está en las queries que cachean, y `page.tsx` ya hace `notFound()` con `null`.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `prisma migrate dev --name platform_admin` generó una sola migración (`ADD COLUMN ... DEFAULT`, ningún DROP). En `platform-admin.test.ts` (26 tests): schemas, `planBanner` (justo en 7 días ya es `expiring`; si vence ahora mismo es `expired`; fecha en la timezone), `monthRange`, `lastActivity`, `generateAdminPassword` (50 distintas de 32 caracteres), los horarios por defecto y las reglas de `invitationAllowsUser`. |
| AC-1 (`monthRange`, borde) | ✅ | Testeé los dos lados del borde: `2026-12-01T01:00Z` (30/11 22:00 en Buenos Aires) sigue en noviembre, y `2026-12-01T03:30Z` (1/12 00:30 en Buenos Aires) ya es diciembre con `start = 2026-12-01T03:00Z`. La frase del spec ("00:30 en BA sigue siendo el mes anterior en UTC") está invertida respecto de UTC-3. Mi lectura: en UTC el mes de negocio arranca 03:00 del 1. |
| AC-1 (`lastLoginAt`) | ✅ | Después de `login` y de aceptar una invitación, la DB muestra `nora lastLoginAt 2026-11-21T17:23:05Z`. También se setea `PlatformAdmin.lastLoginAt` al entrar al admin. |
| AC-2 (script) | ✅ | `pnpm admin:create --email admin@plataforma.test --name "Admin Test"` → exit 0 e imprime la contraseña una vez. Con el mismo email → "Ya existe…", exit 1, sin tocar nada. Con `--email nope` → exit 2. En la DB queda solo el hash `scrypt$…`. |
| AC-2 (login admin) | ✅ | Con `pnpm start -p 3001` invoqué la action por curl (`Next-Action`). Con una contraseña mala, y también con un email que no existe (pasa por `DUMMY_HASH`), devuelve "Email o contraseña incorrectos". Con la buena: `Set-Cookie: admin_session=…; Path=/; Expires=+12h; Secure; HttpOnly; SameSite=strict`, `x-action-redirect: /admin`. "Cerrar sesión" responde `admin_session=; Expires=1970` y redirige a `/admin/login`, y después `/admin` da 307 a `/admin/login`. |
| AC-2 (separación) | ✅ | Tests: un token OWNER no pasa `verifyAdminSession`; un token de admin no pasa `verifySession`; un payload de barbería con `aud=platform-admin` también se rechaza; vencido, con otra firma o alterado → `null`. Con curl: el JWT OWNER puesto en `admin_session` da 307 a `/admin/login`; el JWT de admin puesto en `session` da 307 en `/dashboard/today` a `/login?next=…`; la cookie de admin sola en `/dashboard/today` da 307 a `/login`. |
| AC-2 (DAL en cada página/action) | ✅ | Todas las páginas de `/admin/**` salvo `/login` llaman a `requireAdminSession()` en su componente dentro de `<Suspense>`. Lo probé con un JWT de admin bien firmado pero con un `adminId` que no existe: el proxy lo deja pasar y `GET /admin` devuelve `NEXT_REDIRECT;replace;/admin/login`; `createBarbershop` devuelve "Tu sesión de administrador venció…" y no crea nada. Las 4 actions de gestión hacen `safeParse` → `getAdminSession()` → query. Las únicas excepciones son `adminLogin` (justamente crea la sesión) y `adminLogout`. Las actions de admin solo se pueden invocar desde rutas `/admin/**`: posteadas a `/login` o `/<slug>`, Next responde `{}`. |
| AC-3 | ✅ | Tests de `decideAdminRoute`/`decideAdminRequest` y del matcher. Con curl y sin cookie: `/admin`, `/admin/barbershops` y `/admin/barbershops/new` dan 307 a `/admin/login`, y `/admin/login` da 200. Con la cookie de admin: `/admin` da 200 (ya no se reescribe a 404) y `/admin/login` da 307 a `/admin`. `decidePublicSlug("/admin")` sigue en `not-found` sin consultar la DB. |
| AC-4 | ✅ | La tabla tiene las 8 columnas (`min-w-[960px]` + `overflow-x-auto`) y el slug abre en una pestaña nueva. El buscador `?q=NORTE` devolvió 1 fila (`contains` insensitive). Conté las queries con el log de Prisma (`$on("query")`) en un script descartable: **4 barberías → 7 queries; 9 barberías → 7 queries** (1 `findMany` + 6 `groupBy`: barberos activos, turnos del mes, cortes del mes, y `_max` de `ServiceRecord.createdAt`, `Appointment.createdAt` y `User.lastLoginAt`). El mes se calcula en la timezone de la plataforma (Buenos Aires): por barbería subiría la cantidad de queries. |
| AC-5 | ✅ | Con curl: un slug existente da "Ese slug no está disponible."; un email existente, "Ese email no está disponible."; `admin`, el error de reservado; en ningún caso se crea nada. El caso OK en la DB: barbería con TZ Buenos Aires, ACTIVE, FREE, los 7 horarios (domingo cerrado, 1–6 de 10:00 a 20:00), el OWNER con `hasPw: false` y un INVITE con `tokenHash` de 64 caracteres y 48 h de vigencia. Todo va en una transacción, y si salta un P2002 en carrera se responde con el error genérico. El link se ve una sola vez con `InviteLink`. Al aceptarlo: `Set-Cookie: session` y `x-action-redirect: /dashboard/today`. Reusar el link da "no es válido". |
| AC-6 | ✅ | Editar: con el slug de otra barbería o el email de otro usuario, error genérico; con un plan `GOLD`, "Elegí un plan". El OK cambió nombre y slug: `/barberia-norte`, que estaba cacheado, pasó a 404 y `/norte-centro` da 200 con el nombre nuevo en el `<title>` (`updateTag` con el slug viejo y con el nuevo). Al cambiar el email del dueño, el login con el viejo da error genérico y con el nuevo entra. La fecha del plan se puede borrar (queda `planExpiresAt: null`). RESET: "Nuevo link de acceso" con un dueño que ya tenía contraseña → la página dice "Elegí una nueva contraseña" → acepta y crea la sesión. Después, la contraseña vieja falla, la nueva entra y el link reusado da "no es válido". Un `id` que no existe hace `notFound()` y se ve el texto del not-found. Por el streaming de cacheComponents el status queda en 200, igual que en `/dashboard/barbers/[id]`. |
| AC-7 | ✅ | Con la barbería suspendida, `/norte-centro` da **404** (`curl -w %{http_code}`), el nombre aparece 0 veces en el HTML y se ve "ya no está disponible". Una sesión ya emitida en `/dashboard/today` termina en `NEXT_REDIRECT;replace;/login?suspended=1`, y ese `/login?suspended=1` con la misma cookie da **200** con "Tu barbería está suspendida. Contactá al administrador.", así que no hay loop. El mecanismo está en `isSuspendedNotice` y lo cubren los tests del proxy. Login con la contraseña buena → mensaje de suspendida; con una mala → error genérico. Un link RESET pendiente → "Link no válido" y `acceptInvitation` lo rechaza. En `booking-smoke.ts`: `createPublicBooking` da ok:false y no crea turnos; `getAvailableSlots` y `getPublicBarbershop` dan `null`, `getOnlineServices` da `[]` y `barbershopSlugExists` da `false`. Al reactivar, la landing vuelve a 200, el dashboard sin redirect, el login entra y las reservas dan ok. |
| AC-8 | ✅ | El banner lo ve el OWNER en `/dashboard/today`: con vencimiento a +3 días, "Tu plan vence el 24/11/2026."; vencido, "Tu plan venció el 19/11/2026, contactá al administrador."; a +30 días no aparece. No bloquea nada. La UI de `/admin` es densa y usa tokens de shadcn sin componentes nuevos. Los 4 checks pasan. |

## Checks
lint ✅ · typecheck ✅ · test ✅ (18 archivos, 276 tests) · build ✅ · `pnpm exec tsx scripts/booking-smoke.ts` ✅ OK

## Notas para el review
- **Mecanismo anti-loop:** `requireSession` manda a `/login?suspended=1` solo cuando `getSession` rechazó por barbería suspendida. El proxy no redirige `/login?suspended=1` aunque el JWT sea válido, y la página muestra el aviso. Un `/login` sin el parámetro con JWT válido sigue yendo a `/dashboard`, que vuelve a caer en `/login?suspended=1`. La cadena termina ahí.
- **Mismo secreto en las dos sesiones:** las dos se firman con `SESSION_SECRET`, porque el spec no permite variables de entorno nuevas. La separación la dan el audience (exigido de un lado, prohibido del otro), el nombre de la cookie y la forma del payload.
- **Bug previo, no tocado:** el loop `/login` ↔ `/dashboard` sigue existiendo para un **usuario inactivo** con un JWT vigente. No lo cambié porque está fuera del alcance del job.
- **"Dueño" de la barbería:** es el OWNER más antiguo (`createdAt asc`).
- **Datos de prueba:** los nombres con tilde que mandé por curl quedaron mal codificados en mi DB por el encoding de la consola de Windows (ej. "Barber�a Norte"). No es un bug de la app: las respuestas del servidor salen bien en UTF-8.

## Respuesta a la ronda 1
**Commit:** 1b9782f · lint ✅ · typecheck ✅ · test ✅ (278) · build ✅ · booking-smoke ✅ OK

- ui [blocking]: plan en texto plano y vencidos sin resaltar → nuevo `src/app/admin/(panel)/plan-badge.tsx` (`PlanBadge`), que se usa en la tabla y en el detalle. Muestra el plan como `Badge outline` y usa los mismos umbrales que el banner del dueño (`planBanner`). Vencido → `Badge destructive` "Vencido dd/mm/aaaa". Faltan 7 días o menos → `Badge` resaltado "Vence pronto · dd/mm/aaaa". En los demás casos, "vence dd/mm/aaaa" o "sin vencimiento" en gris. En el detalle saqué la línea "Vencimiento: …" porque quedaba repetida. Lo verifiqué con `pnpm start -p 3001`: una barbería vencida hace 2 días mostró el badge destructive, una que vence en 3 días mostró "Vence pronto", y las que vencen en 30 días o no tienen vencimiento no se resaltan.
- ui nit (tabular-nums) → lo agregué en las fechas del plan y en Última actividad.
- ui nit (header en 360 px) → `flex-wrap` en el header y en el nav del admin.
- ux nit (el link de acceso no aclaraba que es un reset) → la descripción ahora dice "Al usarlo, el dueño elige una contraseña nueva."
- ux nit (slug) → se sugiere desde el nombre con `suggestSlug` (en `platform-admin.ts`, con test) hasta que el admin lo edita a mano.
- ux nit (vencido/por vencer en el listado) → cubierto por el blocking.
- ux nit (window.confirm) → no coincido por ahora: un diálogo propio necesita un componente de shadcn nuevo, y el spec no permite agregarlos.
- ux nit (sumar "contactá al administrador" en el banner de "vence") → no coincido: el spec fija el texto exacto "Tu plan vence el dd/mm/aaaa.".
- security nit (`adminLoginSchema` validaba el email antes de recortarlo) → ahora usa `emailField` (trim → lower → email), con test. En el servidor, el login con `" admin@plataforma.test "` entra.
- security nit (los JWT de barbería emitidos siguen vivos después de un RESET) → fuera de alcance por spec; queda para un job posterior (`passwordChangedAt` contra `iat`).
- security nit (mismo `SESSION_SECRET` para las dos sesiones) → el spec no permite variables de entorno nuevas; queda anotado para cuando se pueda agregar `ADMIN_SESSION_SECRET`.
- security nit (loop de un usuario inactivo) → es un bug previo y queda fuera de alcance. El mismo mecanismo (`/login?inactive=1`) sirve para un job aparte.
- code: PASS, sin acciones.
