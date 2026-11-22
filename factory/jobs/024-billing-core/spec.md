# Núcleo de cobro: modelo de datos, estado de cobro y `recordPayment`

**Pedido:** Modelo de cobro: campos de facturación en `Barbershop` (existentes quedan `billingEnabled=false`), `SubscriptionPayment` (historial, `mpPaymentId` único), `PlatformSettings` (datos de transferencia); lógica pura del estado de cobro (EXEMPT / AWAITING_FIRST_PAYMENT / PAID / GRACE 12 días / BLOCKED) y `recordPayment` idempotente que extiende "pagado hasta". · área: `prisma/**`, `src/lib/billing*.ts`, `src/server/billing*.ts`

## Contexto
- Fuentes obligatorias: plan `docs/superpowers/plans/2026-11-21-suscripcion-mercadopago.md` (sección "Job 024-billing-core",
  "Restricciones globales" y foco de review n.º 1) y diseño `docs/superpowers/specs/2026-11-21-suscripcion-mercadopago-design.md`.
  **Los nombres de campos, modelos, constantes y firmas del plan son contrato** para los jobs 025, 026 y 027: no se renombran.
- `Barbershop` (en `prisma/schema.prisma`) ya tiene `status` (`ACTIVE`/`SUSPENDED`), `plan`, `planExpiresAt DateTime?` y
  `timezone`. `planExpiresAt` pasa a ser "pagado hasta" (`paidUntil`); se guarda como el último milisegundo del día de
  negocio con `planExpiresAtFromDate(date: "YYYY-MM-DD", tz)` de `src/lib/platform-admin.ts`. El día de negocio de un
  instante sale de `businessDate(instant, tz)` en `src/lib/time.ts`.
- Schema a agregar (exacto en el plan): en `Barbershop`, `billingEnabled Boolean @default(false)`,
  `monthlyAmount Decimal? @db.Decimal(12,2)`, `mpPreapprovalId String? @unique`, `mpInitPoint String?`, `mpStatus String?`,
  `payerEmail String?` y la relación `subscriptionPayments`; `enum PaymentSource { MERCADOPAGO MANUAL }`;
  `model SubscriptionPayment` (con `@@index([barbershopId])`, `mpPaymentId String? @unique`, `suspectedDuplicate`,
  `duplicateReviewedAt`, `onDelete: Cascade` como el resto de las tablas hijas); `model PlatformSettings` singleton
  (`id String @id @default("singleton")`). Migración nueva `billing_core` con `pnpm exec prisma migrate dev --name billing_core`.
- Patrones del repo a reusar: violación de unicidad `P2002` → `isUniqueViolation` en `src/lib/records.ts`; transacción con
  reintento ante `P2002` en `src/server/records.ts` (sin dependencias de Next, para poder llamarla desde scripts y tests).
- No hay tests con base de datos en el repo hoy (todos los `*.test.ts` son puros). Ver AC-5.
- Este job no toca Next (no hay rutas ni componentes); no hace falta leer docs de `node_modules/next/dist/docs/`.
  No llama a Mercado Pago.

## Criterios de aceptación
- **AC-1** Schema y migración: existe `prisma/migrations/<timestamp>_billing_core/migration.sql` que agrega los campos,
  el enum y los dos modelos del plan; las filas existentes de `Barbershop` quedan con `billingEnabled = false` (default
  de la columna, sin backfill a `true`). `pnpm exec prisma migrate dev` en una DB limpia aplica sin pedir reset y
  `prisma migrate status` queda al día. No se modifican migraciones anteriores.
- **AC-2** `src/lib/billing.ts` (puro, sin `db` ni `server-only`) exporta `BILLING_GRACE_DAYS = 12`,
  `DUPLICATE_WINDOW_DAYS = 30`, `BillingState`, `billingState`, `canUsePanel`, `isPubliclyVisible`, `extendPaidUntil` e
  `isSuspectedDuplicate` con las firmas exactas del plan. Tests en `src/lib/billing.test.ts`:
  `billingEnabled=false` → `EXEMPT` con `paidUntil` null y vencido; `billingEnabled=true` y `paidUntil=null` →
  `AWAITING_FIRST_PAYMENT`; `now = paidUntil` → `PAID`; `now = paidUntil + 12d` → `GRACE`;
  `now = paidUntil + 12d + 1ms` → `BLOCKED`; y la tabla de `canUsePanel` (false solo en `AWAITING_FIRST_PAYMENT` y
  `BLOCKED`) / `isPubliclyVisible` (false solo en `AWAITING_FIRST_PAYMENT`) sobre los 5 estados.
- **AC-3** `extendPaidUntil` en `src/lib/billing.test.ts`, con `America/Argentina/Buenos_Aires`: pago antes de vencer suma
  desde `paidUntil`; pago tarde suma desde `paidAt`; `paidUntil` null suma desde `paidAt`; día de negocio `2027-01-31`
  + 1 mes → `2027-02-28` (y fin de mes en bisiesto, p. ej. `2028-01-31` → `2028-02-29`); `months=3` suma 3 meses
  calendario. Cada resultado es igual a `planExpiresAtFromDate(<fecha esperada>, tz)` (último ms del día local), y
  hay un caso con `paidAt` a la noche en Argentina que en UTC ya es el día siguiente, para probar que usa el día de negocio.
- **AC-4** `isSuspectedDuplicate` en `src/lib/billing.test.ts`: `true` solo si `source = "MERCADOPAGO"`,
  `paidUntilBefore > paidAt` y `lastManualPaidAt` está dentro de los 30 días anteriores a `paidAt`; `false` si falta
  cualquiera de las tres condiciones (incluido `lastManualPaidAt` a 31 días o null); un pago `MANUAL` siempre `false`.
- **AC-5** `src/server/billing.ts` exporta `recordPayment` con la firma del plan. En una transacción: lee la barbería
  (`planExpiresAt`, `timezone`, último pago `MANUAL`), calcula `suspectedDuplicate` y el nuevo `paidUntil` con las
  funciones de AC-2/3, crea el `SubscriptionPayment` (`amount` como `Decimal` desde el string, `coversUntil` = nuevo
  `paidUntil`) y actualiza `planExpiresAt`. Si el `mpPaymentId` ya existe, o la creación falla con `P2002`, devuelve
  `{ created: false, paidUntil: <el actual de la DB> }` sin extender ni lanzar. Tests en `src/server/billing.test.ts`:
  - dos `recordPayment` con el mismo `mpPaymentId` lanzados con `Promise.all` → exactamente un `SubscriptionPayment`, uno
    devuelve `created: true` y el otro `created: false`, y `planExpiresAt` avanzó **un solo** mes (foco de review n.º 1);
  - una tercera llamada secuencial con el mismo `mpPaymentId` → `created: false` y `planExpiresAt` sin cambios;
  - un pago `MANUAL` (sin `mpPaymentId`) de `months: 2` extiende 2 meses y guarda `note` y `createdByAdminId`;
  - un pago MP con un manual reciente que dejó `paidUntil` en el futuro queda con `suspectedDuplicate = true`.
  Los tests corren contra la DB del worktree (`DATABASE_URL` de su `.env`), creando y borrando su propia barbería. Si el
  builder no logra que corran contra la DB dentro de `pnpm test`, el fallback es el del plan: mockear `@/lib/db` con un
  doble que simule el `P2002` en la segunda inserción, cubriendo la misma rama, y anotarlo en `build.md` junto con una
  verificación manual del `Promise.all` contra la DB real (script o comando y su salida). En ningún caso un test se
  saltea en silencio (`skip` condicional sin DB no cuenta como verde).
- **AC-6** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `src/lib/billing.ts`
- `src/lib/billing.test.ts`
- `src/server/billing.ts`
- `src/server/billing.test.ts`

## Fuera de alcance
- Cualquier llamada o cliente de Mercado Pago, webhook, firma, variables de entorno nuevas o `.env.example` (job 026).
- Usar el estado de cobro en `src/lib/auth.ts`, el layout del panel, queries públicas o server actions (job 025).
- UI del admin, server actions de cobro, Zod de formularios, `createBarbershop` con `billingEnabled: true` y lectura de
  `PlatformSettings` (jobs 025 y 027).
- Seed (`prisma/seed.ts`), cron, reembolsos y contracargos, prorrateo.
- Cambiar el comportamiento de `planBanner` o de `planExpiresAtFromDate` en `src/lib/platform-admin.ts` (se importa,
  no se edita).
- Dependencias nuevas (`package.json` / `pnpm-lock.yaml` no se tocan).

## Riesgos
- **Cambio de schema** (hot files `prisma/schema.prisma` y `prisma/migrations/**`): la migración tiene que dejar a
  todas las barberías existentes en `EXEMPT` (`billingEnabled = false`); si no, se bloquean al desplegar (anti-objetivo).
- **Dinero:** `amount` en `Decimal(12,2)` y se construye desde el string, nunca con `number` flotante.
- **Idempotencia y concurrencia** (foco de review n.º 1): el `@unique` de `mpPaymentId` es la única garantía real ante
  dos llamadas simultáneas; leer-y-chequear antes de insertar no alcanza. La extensión de `planExpiresAt` tiene que
  ocurrir en la misma transacción que la inserción, para que un `P2002` no deje el período extendido.
- **Multi-tenant:** `recordPayment` recibe `barbershopId` de un llamador de confianza (webhook o admin), no de una
  sesión de barbería; no debe exponerse como server action en este job.
