# Build: 024-billing-core
**Rama:** factory/024-billing-core · **Commit:** 5374959 · **Worktree:** .worktrees/024-billing-core

## Qué cambió
- `prisma/schema.prisma`: `Barbershop` suma `billingEnabled` (default false), `monthlyAmount Decimal(12,2)?`, `mpPreapprovalId @unique`, `mpInitPoint`, `mpStatus`, `payerEmail` y la relación `subscriptionPayments`; `enum PaymentSource`; `model SubscriptionPayment` (`@@index([barbershopId])`, `mpPaymentId @unique`, `onDelete: Cascade`); `model PlatformSettings` singleton.
- `prisma/migrations/20261122100000_billing_core/migration.sql`: migración nueva (no se tocaron las anteriores).
- `src/lib/billing.ts`: puro. `BILLING_GRACE_DAYS`, `DUPLICATE_WINDOW_DAYS`, `BillingState`, `billingState`, `canUsePanel`, `isPubliclyVisible`, `extendPaidUntil`, `isSuspectedDuplicate`, con las firmas del plan.
- `src/lib/billing.test.ts`: tests de AC-2, AC-3 y AC-4.
- `src/server/billing.ts`: `recordPayment` (firma del plan), sin dependencias de Next.
- `src/server/billing.test.ts`: tests de AC-5 contra la DB del worktree.

## Notas de implementación
- **Migración:** `prisma migrate dev --name billing_core` se niega a correr en este entorno no interactivo, por el aviso del `@unique` nuevo en `mpPreapprovalId` (pasa lo mismo con `--create-only`). Generé el SQL con `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, que es el mismo diff que produce `migrate dev`. Después `pnpm exec prisma migrate dev` lo aplicó y respondió "in sync". Usé el timestamp `20261122100000` para que quede después de `20261122013553_brand_colors`.
- **Semántica de `billingState`:** `now <= paidUntil` → PAID; `paidUntil < now <= paidUntil + 12d` → GRACE; después → BLOCKED.
- **`isSuspectedDuplicate`:** "dentro de los 30 días" significa `0 <= paidAt - lastManualPaidAt <= 30d`, con el borde incluido: a 30 días da true y a 31 da false.
- **`extendPaidUntil`:** rechaza `months` que no sea entero >= 1.
- **`recordPayment`:**
  - Valida `amount` (string decimal > 0 con 2 decimales como máximo), `months` y que un pago MP traiga `mpPaymentId`.
  - En la transacción hace `SELECT … FOR UPDATE` sobre la barbería, lo que serializa los pagos de esa barbería y evita perder una extensión si llegan dos pagos MP *distintos* a la vez. Después chequea `mpPaymentId`, lee el último pago MANUAL, calcula y crea el pago, y actualiza `planExpiresAt`.
  - El `@unique` sigue siendo la garantía final: un `P2002` revierte toda la transacción, también la extensión, y devuelve `{ created: false, paidUntil: <el de la DB> }`.
- **Tests con DB:** `src/server/billing.test.ts` hace `import "dotenv/config"` (dotenv ya es devDependency) y corre dentro de `pnpm test` contra `barber_job_024`. No se mockea `@/lib/db` ni se saltea nada: sin DB, falla. Cada test crea su barbería y la borra al terminar (los pagos se van en cascada).
- **Rama `P2002`:** con el `FOR UPDATE`, el `Promise.all` lo resuelve el chequeo previo. Para cubrir igual la rama del catch hay un test contra la DB real que envuelve `db.$transaction` y deja ciego el `findUnique` por `mpPaymentId`, así la inserción choca con el `P2002` de verdad. Verifiqué que esa rama corre: si desactivo el `isUniqueViolation` del catch, ese test falla con `Unique constraint failed on the constraint: SubscriptionPayment_mpPaymentId_key`. Después lo restauré.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | El SQL agrega `"billingEnabled" BOOLEAN NOT NULL DEFAULT false`, sin backfill. En una DB nueva `barber_job_024_clean`, `prisma migrate dev` aplicó las 9 migraciones sin pedir reset ("in sync") y `migrate status` dio "Database schema is up to date!". En otra DB temporal apliqué las 8 migraciones anteriores, inserté una barbería y apliqué `billing_core`: la fila quedó `billingEnabled = f`. Las dos DBs temporales se borraron. Las migraciones anteriores no cambiaron (`git diff --name-only main...HEAD`). |
| AC-2 | ✅ | `src/lib/billing.test.ts`: casos EXEMPT (null y vencido), AWAITING_FIRST_PAYMENT, PAID en `now = paidUntil`, GRACE en +1ms y +12d, BLOCKED en +12d+1ms, y tabla `it.each` de los 5 estados para `canUsePanel` / `isPubliclyVisible`. |
| AC-3 | ✅ | Casos: antes de vencer (desde paidUntil), tarde (desde paidAt), null (desde paidAt), `2027-01-31→2027-02-28`, `2028-01-31→2028-02-29`, `months=3` (`2027-04-10→2027-07-10` y `2027-11-30→2028-02-29`) y 22:30 AR = 01:30Z del día siguiente → `2027-04-10`. Todos comparan con `planExpiresAtFromDate(<fecha>, tz)`. |
| AC-4 | ✅ | true con las 3 condiciones (borde de 30 días incluido); false con manual a 31 días, manual null, `paidUntilBefore` pasado, igual a paidAt o null; MANUAL siempre false. |
| AC-5 | ✅ | `src/server/billing.test.ts` contra la DB: `Promise.all` de 2 llamadas → `[false, true]`, 1 registro y `planExpiresAt` en `2027-04-15` (un solo mes); la 3.ª llamada → `created: false` sin cambios; rama `P2002` real → `created: false`, 1 registro y período sin extender; MANUAL `months: 2` → `2027-07-02` con `note` y `createdByAdminId`; MP 3 días después de un manual con el período vigente → `suspectedDuplicate = true`; montos inválidos lanzan sin tocar la DB. 5/5 verdes. |
| AC-6 | ✅ | Ver Checks. |

## Checks
lint ✅ · typecheck ✅ · test ✅ (21 archivos, 361 tests) · build ✅

No levanté el dev server: este job no tiene rutas ni UI.
