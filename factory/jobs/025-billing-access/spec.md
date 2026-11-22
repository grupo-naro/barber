# Bloqueo del panel por cobro y visibilidad pública

**Pedido:** 025-billing-access: Bloqueo del panel por cobro (pantalla "esperando pago" / "pago pendiente" con botón de MP, datos de transferencia y WhatsApp; barberos ven aviso simple), banner en GRACE, guard en server actions del panel, y queries públicas: BLOCKED sigue publicada y reservando, AWAITING_FIRST_PAYMENT no se publica. · área: `src/lib/auth.ts`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/billing-gate.tsx`, `src/server/queries/**`, `src/server/**/booking.ts`, `src/server/actions/invitations.ts` · depende de: 024

## Contexto
Fuentes con decisiones ya tomadas (interfaces, nombres, textos y tests): `docs/superpowers/plans/2026-11-21-suscripcion-mercadopago.md`
→ "Job 025-billing-access", "Restricciones globales" y "Lo que más puede fallar" (este job es dueño de los focos
**n.º 2** y **n.º 3**), y el diseño `docs/superpowers/specs/2026-11-21-suscripcion-mercadopago-design.md`.

Qué hay hoy (el 024 ya está en `main`):
- `src/lib/billing.ts`: `billingState({ billingEnabled, paidUntil }, now)`, `canUsePanel`, `isPubliclyVisible`,
  `BILLING_GRACE_DAYS = 12`. `paidUntil` es `Barbershop.planExpiresAt`.
- Schema: `Barbershop.billingEnabled`, `mpStatus` (`pending`/`authorized`/`paused`/`cancelled` o null),
  `mpInitPoint`, `payerEmail`; modelo singleton `PlatformSettings` (`id = "singleton"`, `transferAlias`,
  `transferCbu`, `transferHolder`, `contactWhatsapp`). No hay que tocar el schema.
- `src/lib/auth.ts`: `lookupSession` (memoizado con `cache`) lee usuario + barbería y rechaza `SUSPENDED`
  (`/login?suspended=1`). `Session.barbershop` hoy no trae datos de cobro.
- `src/app/(dashboard)/layout.tsx`: `SessionHeader` dentro de `<Suspense>` (nombre, rol, "Mi cuenta", "Cerrar
  sesión", `planBanner` del dueño, `DashboardNav`); `children` se renderiza fuera del Suspense.
- Server actions del panel (todas con sesión): `src/server/actions/records.ts` (`requireSession`),
  `services.ts` y `cash.ts` (`requireRole`), `barbers.ts`, `barbershop.ts` y `landing.ts` (helper local
  `ownerSession()` sobre `getSession`). Quedan **sin** guard: `account.ts` (`changePassword`) y `auth.ts` (`logout`).
- Queries públicas con `status: "ACTIVE"`: `src/server/queries/booking.ts` (`getPublicBarbershop`,
  `resolveBarbershop`, `getOnlineServices`), `src/server/queries/landing.ts` (`getPublicLanding`,
  `getPublicOpeningHours`) y `src/server/queries/slug-exists.ts` (`barbershopSlugExists`, lo usa `src/proxy.ts`
  para el 404). La reserva pública es `createPublicBooking` en `src/server/booking.ts` (acepta `now`), envuelta por
  `bookAppointment` en `src/server/actions/booking.ts`; resuelve el tenant con `resolveBarbershop`.
- `src/server/actions/invitations.ts` filtra `barbershop: { status: "ACTIVE" }` al aceptar: **se deja como está**
  (un dueño de una barbería `AWAITING_FIRST_PAYMENT` tiene que poder activar su cuenta y ver la pantalla de pago).
- Tests contra la DB: patrón de `src/server/billing.test.ts` (`import "dotenv/config"`, crea barberías con slug
  aleatorio y las borra en `afterEach`). Nada de `server-only` en lo que importen los tests.

Interfaces a producir (del plan, textuales):
- `export const publicBarbershopWhere: Prisma.BarbershopWhereInput` =
  `{ status: "ACTIVE", OR: [{ billingEnabled: false }, { planExpiresAt: { not: null } }] }` en
  `src/server/queries/public-barbershop-where.ts`; reemplaza cada `status: "ACTIVE"` de las queries públicas.
- `export async function getPlatformSettings(): Promise<PlatformSettings | null>` en
  `src/server/queries/platform-settings.ts`.
- `export function requirePanelAccess(session: Session): void`: redirige a `/dashboard` si
  `!canUsePanel(session.barbershop.billingState)`. Va en `src/lib/billing-access.ts` (sin `server-only`, solo
  `import type { Session }`) para que se pueda testear mockeando `next/navigation`. Ahí mismo, como funciones puras
  testeadas, el texto del banner de `GRACE` y el link de WhatsApp.
- `Session.barbershop` suma `billingEnabled`, `mpStatus`, `mpInitPoint`, `payerEmail` y `billingState`
  (calculado en `lookupSession` con `new Date()`).

Docs de Next 16 que tiene que leer el builder antes de tocar el layout:
`node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`, `05-server-and-client-components.md`,
`07-mutating-data.md`, `08-caching.md` (con `cacheComponents: true`, lo que lea sesión/DB va dentro de `<Suspense>`),
y `02-guides/authentication.md` y `02-guides/data-security.md`.

## Criterios de aceptación
- **AC-1 (foco n.º 2)** Test de Vitest contra la DB (`src/server/billing-access.test.ts`): una barbería `ACTIVE`
  con `billingEnabled: true` y `planExpiresAt` hace más de 12 días (`BLOCKED`), con servicio online y horarios
  cargados, `getPublicBarbershop(slug)` la devuelve, `barbershopSlugExists(slug)` es `true`, y
  `createPublicBooking(slug, input, now)` devuelve `{ ok: true }` y el `Appointment` queda creado en la DB.
- **AC-2** Mismo archivo: con `billingEnabled: true` y `planExpiresAt: null` (`AWAITING_FIRST_PAYMENT`),
  `getPublicBarbershop`, `getPublicLanding` y `getPublicOpeningHours` devuelven `null`, `getOnlineServices` devuelve
  `[]`, `barbershopSlugExists` es `false` y `createPublicBooking` devuelve `{ ok: false }` sin crear el turno. Con
  `billingEnabled: false` y `planExpiresAt` vencido (`EXEMPT`), todo responde como hoy (barbería visible y reserva OK).
- **AC-3 (foco n.º 3)** Mismo archivo: una barbería `SUSPENDED` con cobro al día (`billingEnabled: true`,
  `planExpiresAt` en el futuro): `getPublicBarbershop` → `null`, `barbershopSlugExists` → `false`,
  `createPublicBooking` → `{ ok: false }`, y la action `login` (con `next/headers`/`next/navigation` mockeados y un
  usuario con contraseña válida) devuelve el error de barbería suspendida sin crear la cookie.
- **AC-4** Test puro `src/lib/billing-access.test.ts`: `requirePanelAccess` llama a `redirect("/dashboard")` con
  `BLOCKED` y `AWAITING_FIRST_PAYMENT`, y no hace nada con `EXEMPT`, `PAID` y `GRACE`. El banner de `GRACE` es
  "No pudimos cobrar tu suscripción. Tenés hasta el <fecha> para regularizarla." con fecha `paidUntil + 12 días`
  formateada en la timezone de la barbería (test con un borde de medianoche en `America/Argentina/Buenos_Aires`).
  El link de WhatsApp apunta a `contactWhatsapp` con el texto "Hola, ya transferí la suscripción de <nombre>"
  codificado en la URL.
- **AC-5** Guard en el servidor: todas las server actions de `records.ts`, `services.ts`, `cash.ts`, `barbers.ts`,
  `barbershop.ts` y `landing.ts` llaman a `requirePanelAccess(session)` después de obtener la sesión y antes de
  cualquier lectura o escritura; `changePassword` y `logout` no. Verificable con
  `grep -c requirePanelAccess` en cada archivo (una llamada por action exportada o en su helper de sesión).
- **AC-6** Panel (verificable en `pnpm dev` con una barbería de prueba): con `BLOCKED` o `AWAITING_FIRST_PAYMENT`,
  cualquier ruta de `/dashboard/*` muestra `BillingGate` en lugar del contenido; el header, "Mi cuenta" y "Cerrar
  sesión" siguen visibles, y `/dashboard/account` sigue permitiendo cambiar la contraseña. Para el OWNER: título
  "Esperando tu primer pago" (`AWAITING_FIRST_PAYMENT`) o "Tu suscripción tiene un pago pendiente" (`BLOCKED`);
  con `mpStatus = "pending"` y `mpInitPoint`, botón "Pagar con Mercado Pago" a ese link; con `authorized`, texto
  que guía a cambiar el medio de pago desde su cuenta de MP; con `cancelled` o sin suscripción, sin botón de MP;
  aviso "Pagá con la cuenta de Mercado Pago de <payerEmail>" (solo si hay `payerEmail`); datos de transferencia de
  `getPlatformSettings()` (los que estén cargados) y botón de WhatsApp (solo si hay `contactWhatsapp`). Para un
  BARBER: solo "La barbería tiene un pago pendiente. Hablá con el dueño.", sin datos de pago.
- **AC-7** Banners: con `GRACE`, el OWNER ve el banner de AC-4 en el header y el panel funciona normal; el BARBER no
  ve banner. El `planBanner` actual se muestra solo con `EXEMPT` (con `PAID` no hay banner). Los tests existentes de
  `planBanner` siguen pasando.
- **AC-8** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `src/lib/auth.ts`
- `src/lib/billing-access.ts`
- `src/lib/billing-access.test.ts`
- `src/app/(dashboard)/**` (layout, `billing-gate.tsx`, y si hace falta para que "Mi cuenta" funcione con el panel
  bloqueado, reorganizar `dashboard/account` en un route group propio sin cambiar la URL)
- `src/server/queries/public-barbershop-where.ts`
- `src/server/queries/platform-settings.ts`
- `src/server/queries/booking.ts`
- `src/server/queries/landing.ts`
- `src/server/queries/slug-exists.ts`
- `src/server/booking.ts`
- `src/server/billing-access.test.ts`
- `src/server/actions/records.ts`
- `src/server/actions/services.ts`
- `src/server/actions/cash.ts`
- `src/server/actions/barbers.ts`
- `src/server/actions/barbershop.ts`
- `src/server/actions/landing.ts`

## Fuera de alcance
- Cualquier llamada a Mercado Pago, el webhook, `src/server/billing.ts`, `src/lib/mercadopago*.ts`, `.env.example`
  (son del job 026, que corre en paralelo).
- Admin: sección Suscripción, Ajustes de la plataforma (cargar `PlatformSettings`), toggle de cobro, pago manual
  (job 027). Este job solo **lee** `PlatformSettings`.
- Cambios de schema o migraciones; nuevas dependencias; componentes nuevos de shadcn.
- Tocar `src/server/actions/invitations.ts`, `src/server/actions/auth.ts`, `src/server/actions/account.ts` o
  `src/proxy.ts`: siguen filtrando solo por `status` (la suspensión manual ya corta login y sesiones).
- Invalidar la caché pública (`barbershopBrandingTag`) cuando entra un pago: la landing de una barbería que recién
  pagó aparece al vencer la caché de "minutes"; la invalidación inmediata, si se quiere, es del 026/027.
- Bloquear la lectura de las páginas del panel una por una: el corte es el layout + el guard en las actions.

## Riesgos
- **Auth / hot file:** se modifica `src/lib/auth.ts` (tipo `Session` y `lookupSession`). El orden de rechazos no
  cambia: `SUSPENDED` sigue redirigiendo a `/login?suspended=1` antes de mirar el cobro; el bloqueo por cobro **no**
  invalida la sesión (el usuario entra y ve la pantalla de pago).
- **Reservas de clientes (anti-objetivo):** si `publicBarbershopWhere` se arma mal, una barbería `BLOCKED` deja de
  recibir turnos o una `AWAITING_FIRST_PAYMENT` se publica. Lo cubren AC-1 y AC-2 contra la DB.
- **Loop de redirect:** `requirePanelAccess` redirige a `/dashboard`, que con el panel bloqueado renderiza el gate
  (no vuelve a llamar a `requirePanelAccess`); no usarlo en páginas ni en el layout.
- **Datos de pago:** el gate del BARBER no debe recibir `PlatformSettings`, `payerEmail` ni `mpInitPoint` (no
  pasarlos como props a componentes cliente en ese caso).
- Multi-tenant: sin cambios; el `barbershopId` sigue saliendo de la sesión.
