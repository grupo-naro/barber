# Configuración de la barbería

**Pedido:** "Panel de configuración de la barbería (logo, nombre, descripción, dirección, WhatsApp, horario de apertura y cierre por día, reglas de liquidación por barbero)."

## Contexto
- **Auth (job 001):** `src/lib/auth.ts` exporta `getSession`, `requireSession` y `requireRole(role)` (sin sesión → `/login`, otro rol → `/dashboard`). El `barbershopId` sale SIEMPRE de la sesión. Patrón de formulario a copiar: `src/app/(auth)/login/login-form.tsx` (`useActionState` + Server Action que devuelve un estado).
- **Schema (sin cambios):** `Barbershop` ya tiene `name`, `logoUrl`, `description`, `address`, `whatsapp` (todos opcionales salvo `name`). `OpeningHours` tiene `@@unique([barbershopId, weekday])`, `weekday` 0 = domingo … 6 = sábado, `opensAt`/`closesAt` "HH:mm" y `closed`. `User` tiene `payoutScheme` (`PERCENTAGE` | `FIXED_RENT` | `NONE`) y `payoutValue Decimal(12,2)`.
- **Quién lee estos datos hoy:** la página pública `/[slug]` lee el branding con `getCachedBarbershop` (`src/app/[slug]/data.ts`, `"use cache"` + `cacheLife("minutes")`, sin tag) y `computeFreeSlots` (`src/lib/slots.ts`) usa `OpeningHours`: un día sin fila, con `closed`, o sin `opensAt`/`closesAt` = cerrado. Ya existen `isValidTime` en `src/lib/slots.ts` y `src/lib/time.ts`; reusalos en vez de duplicar.
- **UI:** la página vive en `/dashboard/settings` (dentro del layout `(dashboard)`, que ya pone header y `<main>`). No hay link desde el panel; un job posterior agrega la navegación. Componentes disponibles: `button`, `card`, `input`, `label`, `badge`. **No agregues componentes de shadcn ni dependencias:** para casillas y selects usá `<input type="checkbox">` / `<select>` nativos con clases de tokens de tema; `<textarea>` nativo para la descripción. Logo = campo de texto con URL (sin uploads); vista previa con `<img>` nativo como en `shop-header.tsx`.
- **Docs de Next 16 que el builder tiene que leer:** `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `08-caching.md`, `09-revalidating.md`, `02-guides/forms.md`, `02-guides/authentication-with-cache-components.md` y `02-guides/data-security.md`. Con `cacheComponents: true` la lectura de sesión y de DB va dentro de `<Suspense>`.

### Diseño esperado (no es código)
- `src/lib/barbershop-settings.ts` (puro, sin Prisma ni Next): esquemas Zod y helpers.
  - Perfil: `name` obligatorio (trim, 1–80), `description` (≤ 500), `address` (≤ 200), `whatsapp` (se normaliza a dígitos con `+` opcional; 8–15 dígitos), `logoUrl` (URL `http:`/`https:` o vacío). Strings vacíos → `null`.
  - Horarios: exactamente 7 días (weekday 0–6, sin repetir); si un día está abierto, `opensAt` y `closesAt` son "HH:mm" válidos y `opensAt < closesAt`; si está cerrado se guarda `closed: true`, `opensAt: null`, `closesAt: null`.
  - Liquidación: `PERCENTAGE` → valor entre 0 y 100; `FIXED_RENT` → monto ≥ 0 con hasta 2 decimales; `NONE` → valor 0. El valor se valida y se maneja como string decimal (nunca float para dinero).
- `src/server/queries/barbershop.ts`: `getBarbershopSettings(barbershopId)` → perfil + 7 días (rellenando como cerrados los weekdays sin fila) + usuarios activos e inactivos con `id`, `name`, `role`, `active`, `payoutScheme`, `payoutValue` (como string).
- `src/server/actions/barbershop.ts` con tres actions (`updateBarbershopProfile`, `updateOpeningHours`, `updateBarberPayout`): `safeParse` → `requireRole("OWNER")` → query con el `barbershopId` de la sesión. Horarios: `upsert` de los 7 días en una transacción. Payout: `updateMany`/`findFirst` con `where: { id, barbershopId }` para que un id de otro tenant no matchee (devuelve error, no toca nada). Después de mutar: `revalidatePath("/dashboard/settings")` y, para el perfil, invalidar el branding público (agregar `cacheTag` en `src/app/[slug]/data.ts` y llamar `revalidateTag`/`updateTag` según la doc). Cada action devuelve `{ ok: true } | { ok: false, error, fieldErrors? }`.
- `src/app/(dashboard)/dashboard/settings/`: `page.tsx` (Server Component, `requireRole("OWNER")` dentro de `<Suspense>`) y tres formularios cliente: Perfil, Horarios (una fila por día, lunes primero, casilla "Cerrado" + dos `<input type="time">`), Liquidaciones (una fila por usuario con `<select>` de esquema + valor, con etiqueta "%" o "$" según el esquema). Mobile-first, textos en español rioplatense, mensajes de éxito/error con `aria-live`.

## Criterios de aceptación
- **AC-1** `src/lib/barbershop-settings.test.ts` (Vitest) cubre: perfil válido normaliza vacíos a `null` y el WhatsApp a dígitos; rechaza `name` vacío, `logoUrl` con `javascript:`/sin protocolo y WhatsApp con menos de 8 dígitos; horarios rechazan `opensAt >= closesAt`, horas inválidas ("25:00"), días repetidos o ≠ 7, y un día cerrado sale con horas `null`; liquidación rechaza `PERCENTAGE` 101 y negativos, `FIXED_RENT` con 3 decimales, y `NONE` normaliza el valor a "0".
- **AC-2** Con sesión OWNER (seed), `GET /dashboard/settings` muestra los datos actuales: nombre, descripción, dirección, WhatsApp y logo de la barbería; los 7 días con sus horarios del seed (domingo cerrado, lunes 10:00–20:00, sábado 09:00–18:00); y cada usuario de la barbería con su esquema y valor (Martín 50 %, Nicolás alquiler $120.000). Sin sesión redirige a `/login`; con sesión BARBER redirige a `/dashboard`.
- **AC-3** Guardar el perfil (p. ej. cambiar nombre y descripción) persiste en `Barbershop` del tenant de la sesión, muestra confirmación, y la página pública `/<slug>` muestra el nombre nuevo en la siguiente carga (sin esperar a que venza el `cacheLife`). Un perfil inválido muestra el error junto al campo y no escribe nada.
- **AC-4** Guardar horarios (p. ej. marcar el lunes como cerrado y el domingo 10:00–14:00) deja exactamente 7 filas de `OpeningHours` para la barbería y la página pública refleja el cambio: el lunes no ofrece turnos y el domingo sí, entre 10:00 y 14:00. Un día con apertura ≥ cierre muestra error y no se guarda ningún día.
- **AC-5** Cambiar la regla de liquidación de un barbero (p. ej. Lucas de `PERCENTAGE` 40 a `FIXED_RENT` 90000) persiste `payoutScheme`/`payoutValue` como `Decimal`. Las tres actions re-verifican rol y tenant en el servidor: llamadas por un BARBER o con un `userId` de otra barbería no modifican nada y devuelven error (verificable con un test o un script que invoque la query de escritura con un `barbershopId` ajeno, o leyendo el código: todo `where` incluye el `barbershopId` de la sesión).
- **AC-6** La página es usable a 375 px de ancho sin scroll horizontal, con controles de al menos 44 px de alto, labels asociados a cada input y sin colores crudos (solo tokens de tema).
- **AC-7** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `src/app/(dashboard)/dashboard/settings/**`
- `src/server/actions/barbershop.ts`
- `src/server/queries/barbershop.ts`
- `src/lib/barbershop-settings.ts`
- `src/lib/barbershop-settings.test.ts`
- `src/app/[slug]/data.ts`

## Fuera de alcance
- Subida de archivos para el logo (solo URL), cambio de `slug`, `timezone` o `phone`.
- Horarios partidos (dos turnos por día), feriados o excepciones por fecha, horarios por barbero.
- Alta/baja/edición de barberos (nombre, email, rol, `active`) y gestión de contraseñas.
- Cálculo de liquidaciones o cierre de caja (solo se configura la regla).
- Links de navegación en `src/app/(dashboard)/layout.tsx` o `src/app/(dashboard)/dashboard/page.tsx`.
- Nuevos componentes de shadcn, dependencias o cambios en `prisma/schema.prisma`.
- Cualquier cosa bajo `src/app/(dashboard)/dashboard/services/**` (job 003 en paralelo).

## Riesgos
- **Auth / multi-tenant:** las actions modifican datos del tenant; el `barbershopId` y el rol OWNER se sacan de la sesión en el servidor, nunca de campos del formulario. El `userId` de la liquidación viene del cliente: tiene que filtrarse por `barbershopId`.
- **Dinero:** `payoutValue` es `Decimal`; no convertir a `number` para validar ni guardar.
- **XSS por URL de logo:** solo `http:`/`https:` (se renderiza en la web pública).
- **Cache:** el branding público está cacheado; si no se invalida con tag, AC-3 falla. Tocar `src/app/[slug]/data.ts` (job 004 ya cerrado) solo para agregar el tag.
- Sin cambios de schema ni dependencias nuevas.
