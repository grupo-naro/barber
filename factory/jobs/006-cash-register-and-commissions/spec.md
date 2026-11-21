# Cierre de caja y liquidación de barberos

**Pedido:** "Cierre de caja diario desglosado por medio de pago y liquidación automática de cada barbero según su acuerdo."

## Contexto
- Auth (001): `src/lib/auth.ts` → `requireRole("OWNER")` devuelve `Session` con `barbershopId`, `userId` y `barbershop.timezone`. Es la única fuente del `barbershopId`.
- Acuerdos de liquidación (002): `User.payoutScheme` (`PERCENTAGE | FIXED_RENT | NONE`) + `User.payoutValue` (`Decimal(12,2)`), editables en `/dashboard/settings`. Las etiquetas están en `src/lib/barbershop-settings.ts` (`PAYOUT_SCHEME_LABELS`); se pueden importar, no modificar.
- Modelos ya existentes en `prisma/schema.prisma` (no hay cambios de schema):
  - `ServiceRecord` (`businessDate @db.Date`, `barberId`, `paymentMethod: CASH|TRANSFER|CARD|OTHER`, `total Decimal(12,2)`, `cashCloseId?`). Un registro está "abierto" si `cashCloseId` es `null`.
  - `CashRegisterClose` (`totalCash/Transfer/Card/Other`, `total`, `closedById`, `closedAt`, `notes?`, `@@unique([barbershopId, businessDate])`).
  - `BarberPayout` (`scheme`, `schemeValue`, `grossAmount`, `barberAmount`, `shopAmount`, `@@unique([cashCloseId, barberId])`).
- Dinero: patrón de `src/lib/pricing.ts` (centavos `bigint`, `priceToCents`/`centsToPrice`); nunca `number` flotante. Mostrar en ARS con `Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" })` (hay un helper similar en `src/app/(dashboard)/dashboard/services/format.ts`, se puede importar).
- Fechas: día de negocio con `businessDate(new Date(), session.barbershop.timezone)` de `src/lib/time.ts`; validar `YYYY-MM-DD` con `isValidDate` de `src/lib/slots.ts`. Para consultar una columna `@db.Date`, usar `new Date("YYYY-MM-DDT00:00:00.000Z")`.
- Los `ServiceRecord` los crea el job 005 (en paralelo). Este job **no** depende de él: se verifica con Vitest y con un script propio que inserta registros directamente.
- Docs de Next 16 que el builder tiene que leer: `node_modules/next/dist/docs/01-app/` → `08-caching.md` (`cacheComponents: true`: la página lee sesión/DB dentro de `<Suspense>`), `02-guides/data-security.md`, `02-guides/authentication.md`, y la guía de Server Actions / formularios (`useActionState`, `revalidatePath`). `searchParams` es asíncrono.

### Diseño
- **`src/lib/payouts.ts`** (puro, sin Prisma ni Next, en centavos `bigint`):
  - `computePayout({ scheme, value, grossCents })` → `{ barberCents, shopCents }` con `barberCents + shopCents === grossCents` siempre.
    - `PERCENTAGE`: `barber = round(gross × value / 100)` a centavos, redondeo half-up (mitad hacia arriba, gross ≥ 0); `shop = gross − barber`.
    - `NONE`: `barber = 0`, `shop = gross`.
    - `FIXED_RENT` (supuesto, ver Riesgos): `shop = rent` (= `value`), `barber = gross − rent` (puede ser negativo: el barbero le debe a la barbería).
  - `summarizeDay(records, barbers)` → totales por medio de pago (`CASH/TRANSFER/CARD/OTHER`), total general, y por cada barbero con registros: `grossCents`, `scheme`, `value`, `barberCents`, `shopCents`. Barberos ordenados por nombre. Barberos sin registros ese día no aparecen (no se les cobra alquiler).
- **`src/server/queries/cash.ts`**: `getCashDay(barbershopId, date)` → si existe `CashRegisterClose` para ese día devuelve el cierre guardado (totales, payouts snapshot con nombre de barbero, quién y cuándo cerró, notas, cantidad de registros); si no, devuelve la vista previa calculada con `summarizeDay` sobre los `ServiceRecord` abiertos (`cashCloseId: null`) de ese día y el acuerdo **vigente** de cada barbero.
- **`src/server/actions/cash.ts`**: `closeCashRegister(prev, formData)` con Zod (`date` `YYYY-MM-DD` válido y no futuro respecto de hoy en la timezone de la barbería; `notes` opcional ≤ 500), después `requireRole("OWNER")`, después en **una** `db.$transaction`: leer registros abiertos del día + acuerdos de sus barberos, recalcular con `summarizeDay`, crear `CashRegisterClose` (con `closedById = session.userId`) y sus `BarberPayout` (copiando `scheme` y `payoutValue` → `schemeValue`), y vincular los registros con `updateMany({ where: { id: { in: ids }, cashCloseId: null, barbershopId } })`; si la cantidad actualizada no coincide con la leída, abortar (rollback) y pedir que se reintente. Si falla por la unique `(barbershopId, businessDate)` (P2002) → error "Ya se cerró la caja de ese día" sin 500. Día sin registros → error "No hay cortes para cerrar ese día". `revalidatePath("/dashboard/cash")`.
- **UI `/dashboard/cash`** (`src/app/(dashboard)/dashboard/cash/**`): Server Component con `requireRole("OWNER")` dentro de `<Suspense>`; selector de fecha (`?date=YYYY-MM-DD`, default hoy; fecha inválida → hoy); tarjeta de totales por medio de pago (Efectivo, Transferencia, Tarjeta, Otro, Total); tabla/lista por barbero (nombre, acuerdo, facturado, le corresponde, queda para la barbería), con montos negativos en `text-destructive` y la leyenda "Debe a la barbería"; total a pagar a barberos y total que queda para la barbería. Si el día está abierto: textarea de notas + botón "Cerrar caja" (cliente mínimo con `useActionState`, confirmación antes de enviar). Si está cerrado: badge "Caja cerrada", quién y cuándo (hora local), notas, y sin botón ni formulario (solo lectura). Mobile-first, componentes existentes de `src/components/ui/` (no se agregan nuevos).

## Criterios de aceptación
- **AC-1** `src/lib/payouts.test.ts` (Vitest) cubre `computePayout`: `PERCENTAGE` 50 % de $10.000 → barbero 5000.00 / barbería 5000.00; `PERCENTAGE` 33.33 % de $100,01 → redondeo half-up a centavos y `barber + shop === gross`; `PERCENTAGE` 0 y 100; `NONE` → barbero 0; `FIXED_RENT` 8000 con bruto 20000 → barbero 12000 / barbería 8000, y con bruto 5000 → barbero −3000 / barbería 8000. Ningún cálculo usa `number` para dinero (los tests pasan montos como string/`bigint`).
- **AC-2** `payouts.test.ts` cubre `summarizeDay`: registros de 2 barberos con distintos medios de pago → totales por `CASH/TRANSFER/CARD/OTHER` y total general exactos (incluyendo centavos, p. ej. 0.10 + 0.20 = 0.30), bruto por barbero = suma de sus registros, y la suma de todos los `barber + shop` = total general.
- **AC-3** Acceso: `/dashboard/cash` sin sesión redirige a `/login`; con un usuario `BARBER` redirige a `/dashboard`; `closeCashRegister` llamado por un `BARBER` no crea nada. Todas las queries filtran por el `barbershopId` de la sesión: los registros de otra barbería del mismo día no aparecen ni se cierran.
- **AC-4** Vista previa: con `scripts/cash-smoke.ts` cargado (`pnpm exec tsx scripts/cash-smoke.ts`), al entrar como OWNER de la barbería de smoke a `/dashboard/cash?date=<fecha del smoke>` se ven los totales por medio de pago y por barbero que imprime el script; sin `?date` se muestra el día de hoy en `America/Argentina/Buenos_Aires`; un barbero `FIXED_RENT` que facturó menos que el alquiler muestra un monto negativo marcado como "Debe a la barbería".
- **AC-5** Cierre atómico: el script `scripts/cash-smoke.ts` (idempotente: borra y recrea las barberías `smoke-006` y `smoke-006-other`, con un barbero de cada esquema y `ServiceRecord`+`ServiceRecordItem` insertados directo en la DB) ejecuta la misma lógica de cierre que la action (extraída a una función server-only en `src/server/queries/cash.ts` o `src/server/actions/cash.ts` que recibe `barbershopId`/`userId`) y verifica con ✓/✗ y exit code ≠ 0 si falla: se crea 1 `CashRegisterClose` con totales correctos, un `BarberPayout` por barbero con `scheme`/`schemeValue` copiados del acuerdo, todos los registros del día quedan con `cashCloseId`, y los registros de `smoke-006-other` no se tocan.
- **AC-6** No se cierra dos veces y lo cerrado es de solo lectura: un segundo cierre del mismo día devuelve "Ya se cerró la caja de ese día" (sin 500 y sin crear filas); cambiar el `payoutValue` de un barbero después del cierre no altera lo que muestra `/dashboard/cash` para ese día (muestra el snapshot); en un día cerrado la página no muestra el botón "Cerrar caja". Cerrar un día sin registros abiertos devuelve "No hay cortes para cerrar ese día". El script de smoke verifica los tres casos.
- **AC-7** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `src/lib/payouts.ts`
- `src/lib/payouts.test.ts`
- `src/server/actions/cash.ts`
- `src/server/queries/cash.ts`
- `src/app/(dashboard)/dashboard/cash/**`
- `scripts/cash-smoke.ts`

## Fuera de alcance
- Crear, editar o borrar `ServiceRecord` (es del job 005: `src/app/(dashboard)/dashboard/today/**`, `src/server/actions/records.ts`).
- Reabrir/anular un cierre, editar un cierre ya hecho, o editar registros de un día cerrado.
- Link a `/dashboard/cash` desde el layout o el inicio del panel (`src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/dashboard/page.tsx` no se tocan).
- Historial/listado de cierres, reportes por rango de fechas, exportar a PDF/Excel, arqueo de efectivo contado vs. esperado.
- Vista del barbero de su propia liquidación (solo OWNER en este MVP).
- Cobro de alquiler `FIXED_RENT` en días sin registros, alquiler semanal/mensual, propinas, gastos o egresos de caja.
- Cambios de schema/migraciones, dependencias nuevas o componentes nuevos de shadcn.

## Riesgos
- **Dinero:** todo el cálculo en centavos `bigint`; `barber + shop = gross` por construcción (el redondeo de `PERCENTAGE` se absorbe en `shopAmount`). Valores negativos de `barberAmount` caben en `Decimal(12,2)`.
- **SUPUESTO `FIXED_RENT` (a confirmar por el humano):** `payoutValue` se interpreta como **alquiler de silla diario**. En un día en que el barbero tiene registros: `barberAmount = gross − rent` (puede ser negativo = el barbero le debe a la barbería, se muestra claramente), `shopAmount = rent`. En días sin registros **no** se cobra alquiler en este MVP. Si el acuerdo real es semanal/mensual o se cobra todos los días, hay que cambiar `computePayout`/`summarizeDay` y el criterio AC-1.
- **Snapshot:** el acuerdo vigente se copia a `BarberPayout` al cerrar; cambios posteriores en Configuración no afectan cierres pasados (y la vista previa de días abiertos sí usa el acuerdo vigente).
- **Concurrencia:** dos cierres simultáneos del mismo día quedan resueltos por la unique `(barbershopId, businessDate)` + transacción; un registro creado por 005 mientras se cierra queda abierto (el `updateMany` filtra por ids leídos) y no se pierde, pero ese día ya no se puede volver a cerrar: queda fuera del cierre (limitación conocida del MVP, se ve como "registros sin cerrar" si se consulta).
- **Auth / multi-tenant:** OWNER-only; `barbershopId` siempre de la sesión.
- **Paralelismo con 005:** scope disjunto; este job no toca `today/**` ni `records.ts` ni el layout/inicio del dashboard. Sin cambios de schema ni dependencias.
