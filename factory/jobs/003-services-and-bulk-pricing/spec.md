# Servicios y actualización masiva de precios

**Pedido:** "CRUD de servicios + actualización masiva de precios (% o monto fijo, con redondeo configurable a $500 o $1000)."

## Contexto
- Modelo `Service` (`prisma/schema.prisma`): `barbershopId`, `name`, `description?`, `price Decimal(12,2)`, `durationMinutes`,
  `active` (default true), `showOnline` (default true), `sortOrder`. `Appointment` y `ServiceRecordItem` referencian
  servicios → **no hay borrado físico**: "eliminar" = `active=false` (y se puede reactivar). Sin cambios de schema.
- Auth (`src/lib/auth.ts`): `requireSession()` / `requireRole("OWNER")`; el `barbershopId` sale SIEMPRE de la sesión.
- Panel bajo `src/app/(dashboard)/` (el layout ya pone header con sesión y `<main>`). La nueva página vive en
  `/dashboard/services` y se llega por URL (los links del nav los agrega otro job).
- La web pública (`src/server/queries/booking.ts#getOnlineServices`) ya lista sólo `active && showOnline`, ordenado por
  `sortOrder, name`, y no se cachea con `"use cache"` (sólo el branding), así que los cambios se ven sin tocar `/[slug]`.
- Patrón de mutaciones (ver `src/server/actions/auth.ts`, `booking.ts`): Server Action con Zod 4 `safeParse` → sesión/rol
  → query filtrada por `barbershopId` de la sesión. Lecturas en `src/server/queries/services.ts`.
- Dinero: `Decimal` de Prisma (`Prisma.Decimal` del cliente generado en `@/generated/prisma/client`, o aritmética en
  centavos enteros sobre strings); nunca `number` flotante. Mostrar con `Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" })`.
  Precios entre server y client como string decimal (`"12000.00"`), como hace `PublicService`.
- UI disponible: `src/components/ui/{button,card,input,label,badge}.tsx`. No hay dialog/select/table: usar elementos
  nativos (`<select>`, `<details>`, formularios en línea o subruta `/dashboard/services/[id]`) en lugar de agregar shadcn.
- Docs de Next 16 a leer: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `08-caching.md`,
  `09-revalidating.md`, `02-guides/forms.md`, `02-guides/server-actions.md`, `02-guides/data-security.md`,
  `02-guides/authentication-with-cache-components.md`. `cacheComponents: true`: sesión/DB dentro de `<Suspense>`;
  `params` es asíncrono.

## Criterios de aceptación
- **AC-1 Lógica pura de precios** (`src/lib/pricing.ts`, sin Prisma-client de DB ni Next): una función calcula el nuevo
  precio a partir de precio actual (string/Decimal), modo `percent | fixed`, valor (puede ser negativo, ej. `-10` %) y
  redondeo `none | 500 | 1000` (redondeo al múltiplo más cercano, mitades hacia arriba). Resultado exacto con 2 decimales,
  nunca negativo (piso en 0). Tests de Vitest en `src/lib/pricing.test.ts` cubren al menos: `12000 +10% → 13200.00`;
  `12000 +10% redondeo 500 → 13000.00`; `12000 +12.5% redondeo 1000 → 14000.00` (13500 → 14000); `7250 + 0 redondeo 500
  → 7500.00`; `100.10 × 3 servicios +10%` sin error de float (`110.11`); monto fijo `+1500`; descuento que bajaría de 0 → `0.00`.
- **AC-2 Listado** `/dashboard/services`: con sesión muestra los servicios de SU barbería (nombre, precio en ARS, duración,
  badges "Inactivo" / "Oculto online"), activos primero y en orden `sortOrder, name`. Sin sesión → `/login`. Un BARBER
  puede ver la lista pero no ve los controles de edición/alta/precios. Nunca aparecen servicios de otra barbería.
- **AC-3 Alta y edición** (OWNER): formulario con nombre (1–80), descripción opcional (≤500), precio (decimal ≥ 0, máx 2
  decimales, validado como string, no float), duración (entero 5–480), `showOnline`, `sortOrder`. Errores de Zod se
  muestran por campo en español. Las actions (`createService`, `updateService`) usan `requireRole("OWNER")` y actualizan
  con `where: { id, barbershopId }` (un id de otra barbería no modifica nada y devuelve error). Tras guardar se revalida
  `/dashboard/services` y el cambio aparece en `/<slug>`.
- **AC-4 Desactivar/reactivar** (OWNER): acción `setServiceActive(id, active)` que sólo cambia `active`; no hay borrado
  físico. Un servicio inactivo deja de aparecer en `/<slug>` y sigue listado en el panel como "Inactivo".
- **AC-5 Actualización masiva con preview** (OWNER): en `/dashboard/services` el dueño elige modo (% o monto fijo), valor
  y redondeo (sin / $500 / $1000) y alcance (todos los servicios activos, o una selección). Antes de aplicar ve una vista
  previa por servicio "precio actual → precio nuevo" calculada con `src/lib/pricing.ts` (la misma función que el server).
  Al confirmar, la action `applyBulkPriceUpdate` re-valida con Zod, exige OWNER, **recalcula en el servidor** desde los
  precios de la DB (no confía en los precios que manda el cliente) y escribe todos los cambios en **una sola
  `db.$transaction`** filtrando por `barbershopId` de la sesión; ids ajenos se ignoran/rechazan. Devuelve cuántos se
  actualizaron y la UI lo informa.
- **AC-6 UI**: mobile-first, objetivos táctiles ≥ 44px, tokens de tema, textos en rioplatense, estados de envío
  (`useActionState`/pending) y mensajes de éxito/error. Sin dependencias nuevas ni componentes de shadcn nuevos.
- **AC-7** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `src/app/(dashboard)/dashboard/services/**`
- `src/server/actions/services.ts`
- `src/server/queries/services.ts`
- `src/lib/pricing.ts`
- `src/lib/pricing.test.ts`

## Fuera de alcance
- Links en el nav o en `src/app/(dashboard)/layout.tsx` / `src/app/(dashboard)/dashboard/page.tsx` (lo hace un job posterior).
- Cualquier cambio en `src/app/[slug]/**`, `src/server/queries/booking.ts` o `src/server/actions/booking.ts`.
- Borrado físico, historial de precios, cambios de schema/migraciones, reordenamiento drag & drop.
- Configuración de la barbería (`/dashboard/settings`, job 002), nuevos componentes en `src/components/ui/`,
  dependencias nuevas (`package.json`, `pnpm-lock.yaml`).
- Precios por barbero, combos o promociones con fecha.

## Riesgos
- **Dinero:** cálculo y redondeo deben ser exactos (Decimal/centavos), mismo código en preview y en servidor.
- **Auth/tenants:** toda mutación OWNER-only y filtrada por `barbershopId` de la sesión; un id de otro tenant no debe
  poder editarse, desactivarse ni entrar en la actualización masiva.
- **Atomicidad:** la actualización masiva es todo-o-nada en una transacción.
- Schema y dependencias: ninguno.
