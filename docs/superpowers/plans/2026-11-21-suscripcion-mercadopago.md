# Suscripción automática con Mercado Pago: plan de implementación

> **Para agentes:** este plan se ejecuta con **/factory**, un job por tarea, en el orden de las dependencias. El
> spec-writer de cada job parte de su tarea y del diseño. El builder hace TDD con los tests nombrados acá. Para
> cualquier detalle de Mercado Pago (campos, firma del webhook, estados), **consultá el MCP `mercadopago`**
> (`search_documentation`, siteId `MLA`), no la web.

**Objetivo:** cobro mensual automático por barbería vía suscripciones de Mercado Pago (preapproval sin plan,
pago pendiente), con alta gestionada por el admin, bloqueo del panel por falta de pago sin cortar la landing,
y pago manual por transferencia.

**Arquitectura:** el estado de cobro se **deriva** en cada request a partir de `billingEnabled` y
`planExpiresAt` ("pagado hasta"), con funciones puras en `src/lib/billing.ts`. No hay cron. Todos los pagos, de
MP o manuales, pasan por una única función de servidor que es idempotente y extiende el período. MP avisa por un
webhook en `/api/webhooks/mercadopago`, que el proxy no intercepta.

**Stack:** Next.js 16, Prisma 7, Zod 4, Vitest, `fetch` contra la API REST de MP (sin SDK, para no tocar
`package.json`).

**Diseño:** [docs/superpowers/specs/2026-11-21-suscripcion-mercadopago-design.md](../specs/2026-11-21-suscripcion-mercadopago-design.md)

## Restricciones globales

- `BILLING_GRACE_DAYS = 12` (10 días de reintentos de MP + 2).
- Barberías existentes al migrar: `billingEnabled = false` (EXEMPT, igual que hoy). Las creadas desde el admin
  después del job 027: `billingEnabled = true`.
- `planExpiresAt` es "pagado hasta". Con cobro activado no se edita a mano: solo cambia con pagos.
- `status = SUSPENDED` (suspensión manual) sigue cortando todo y le gana a cualquier estado de cobro.
- `BLOCKED` corta el panel, **nunca** la landing ni las reservas. `AWAITING_FIRST_PAYMENT` corta las dos cosas.
- Dinero en `Decimal(12,2)`, ARS. Fechas de negocio en la timezone de la barbería (`src/lib/time.ts`).
- Idempotencia: `SubscriptionPayment.mpPaymentId` es único, y es el id del **pago** de MP, no el de la cuota.
- Textos en español rioplatense (vos). Mobile-first. Componentes shadcn.
- Variables de entorno nuevas: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `APP_BASE_URL` (en `.env.example`).

## Lo que más puede fallar (foco de la review)

1. **El mismo pago llega dos veces a la vez** (por `payment` y `subscription_authorized_payment`, o por un
   reintento de MP): un solo `SubscriptionPayment` y una sola extensión del período. → test en 024.
2. **Barbería `BLOCKED`: la server action de reserva pública** (no solo la página) sigue aceptando turnos.
   → test en 025.
3. **Barbería `SUSPENDED` con el cobro al día:** sigue sin panel, sin landing y sin reservas. → test en 025.
4. **Webhook con firma inválida, de otro recurso o de una suscripción desconocida:** firma inválida → 401 sin
   tocar la DB. Recurso desconocido → 200 e ignorar, sin error 500. → test en 026.
5. **Desactivar el cobro cuando MP falla al cancelar:** la barbería no cambia y el admin ve el error.
   → test en 027.

---

### Job 024-billing-core: modelo de datos y lógica de cobro

**Archivos:**
- Modificar: `prisma/schema.prisma`, `prisma/migrations/**` (nueva migración `billing_core`)
- Crear: `src/lib/billing.ts`, `src/lib/billing.test.ts`, `src/server/billing.ts`, `src/server/billing.test.ts`
  (con la DB del worktree, siguiendo el patrón de tests con DB que ya tenga el repo; si no hay ninguno, la lógica
  de idempotencia se testea con la función pura y el builder lo anota en `build.md`)

**Schema:**
- `Barbershop` suma `billingEnabled Boolean @default(false)`, `monthlyAmount Decimal? @db.Decimal(12,2)`,
  `mpPreapprovalId String? @unique`, `mpInitPoint String?`, `mpStatus String?`, `payerEmail String?` y la relación
  `subscriptionPayments`.
- `enum PaymentSource { MERCADOPAGO MANUAL }`.
- `model SubscriptionPayment`: `id`, `barbershopId` (con índice), `source`, `amount Decimal(12,2)`,
  `paidAt DateTime`, `coversUntil DateTime`, `mpPaymentId String? @unique`, `note String?`,
  `createdByAdminId String?`, `suspectedDuplicate Boolean @default(false)`, `duplicateReviewedAt DateTime?`,
  `createdAt`.
- `model PlatformSettings` (una sola fila, `id = "singleton"`): `transferAlias String?`, `transferCbu String?`,
  `transferHolder String?`, `contactWhatsapp String?`, `updatedAt`.

**Interfaces que produce:**
```ts
// src/lib/billing.ts (puro)
export const BILLING_GRACE_DAYS = 12;
export const DUPLICATE_WINDOW_DAYS = 30;
export type BillingState = "EXEMPT" | "AWAITING_FIRST_PAYMENT" | "PAID" | "GRACE" | "BLOCKED";
export function billingState(input: { billingEnabled: boolean; paidUntil: Date | null }, now: Date): BillingState;
export function canUsePanel(state: BillingState): boolean;          // false solo en AWAITING_FIRST_PAYMENT y BLOCKED
export function isPubliclyVisible(state: BillingState): boolean;    // false solo en AWAITING_FIRST_PAYMENT
export function extendPaidUntil(paidUntil: Date | null, paidAt: Date, months: number, timeZone: string): Date;
export function isSuspectedDuplicate(input: {
  source: "MERCADOPAGO" | "MANUAL"; paidUntilBefore: Date | null; paidAt: Date; lastManualPaidAt: Date | null;
}): boolean;
// src/server/billing.ts
export async function recordPayment(input: {
  barbershopId: string; source: "MERCADOPAGO" | "MANUAL"; amount: string; paidAt: Date; months: number;
  mpPaymentId?: string; note?: string; createdByAdminId?: string;
}): Promise<{ created: boolean; paidUntil: Date }>;
```
- `extendPaidUntil`: toma la fecha de negocio de `max(paidUntil, paidAt)`, le suma `months` meses calendario (si el
  día no existe en el mes destino, usa el último día de ese mes) y convierte con `planExpiresAtFromDate(fecha, tz)`.
- `recordPayment`: en una transacción lee la barbería, calcula `suspectedDuplicate` y el nuevo `paidUntil`, crea el
  pago y actualiza `planExpiresAt`. Si `mpPaymentId` ya existe (incluido el error `P2002` cuando dos llamadas
  compiten), devuelve `{ created: false }` sin extender.

- [ ] **Paso 1: tests de `src/lib/billing.test.ts` (tienen que fallar primero)**
  - `billingState`: `billingEnabled=false` → `EXEMPT` aunque `paidUntil` sea null o esté vencido.
    `paidUntil=null` → `AWAITING_FIRST_PAYMENT`. Si `now = paidUntil` → `PAID`. `now = paidUntil + 12d`
    → `GRACE`. `now = paidUntil + 12d + 1ms` → `BLOCKED`.
  - `canUsePanel` / `isPubliclyVisible` sobre los 5 estados (tabla).
  - `extendPaidUntil`: si pagó antes de vencer, suma a partir de `paidUntil`. Si pagó tarde, suma a partir de
    `paidAt`. Si `paidUntil` es null, suma a partir de `paidAt`. `2027-01-31` + 1 mes → `2027-02-28`.
    `months=3` suma 3 meses. La fecha de negocio de la salida, en `America/Argentina/Buenos_Aires`, es la esperada.
  - `isSuspectedDuplicate`: es `true` solo si el pago es MP, `paidUntilBefore > paidAt` y hubo un pago manual en
    los 30 días anteriores a `paidAt`. Un pago `MANUAL` siempre da `false`.
- [ ] **Paso 2:** `pnpm test src/lib/billing.test.ts` → FAIL.
- [ ] **Paso 3:** schema + migración (`pnpm exec prisma migrate dev --name billing_core`). Implementar
  `src/lib/billing.ts`.
- [ ] **Paso 4:** test de `recordPayment`. Dos llamadas con el mismo `mpPaymentId`, con `Promise.all`, crean un
  solo registro y extienden un solo mes (foco de review n.º 1). Un pago manual de 2 meses extiende 2 meses.
- [ ] **Paso 5:** implementar `src/server/billing.ts`. Correr `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → verde.
- [ ] **Paso 6:** commit.

### Job 025-billing-access: bloqueo del panel y visibilidad pública · depende de: 024

**Archivos:**
- Modificar: `src/lib/auth.ts` (`Session.barbershop` suma `billingEnabled`, `mpStatus`, `mpInitPoint`,
  `payerEmail`, y `billingState` ya calculado), `src/app/(dashboard)/layout.tsx`, el guard de las server actions
  del panel (donde `requireSession` se usa para mutar), `src/server/queries/booking.ts`,
  `src/server/queries/landing.ts`, `src/server/queries/slug-exists.ts`, la server action de reserva pública
  (`src/server/**/booking.ts`) y `src/server/actions/invitations.ts` si filtra por `ACTIVE`.
- Crear: `src/app/(dashboard)/billing-gate.tsx` (pantallas de bloqueo), `src/server/queries/platform-settings.ts`,
  `src/server/queries/public-barbershop-where.ts`.

**Interfaces:**
- Consume: `billingState`, `canUsePanel`, `isPubliclyVisible` (024).
- Produce: `export const publicBarbershopWhere: Prisma.BarbershopWhereInput`
  (`{ status: "ACTIVE", OR: [{ billingEnabled: false }, { planExpiresAt: { not: null } }] }`), que reemplaza cada
  `status: "ACTIVE"` de las queries públicas; `export async function getPlatformSettings(): Promise<PlatformSettings | null>`;
  `export function requirePanelAccess(session: Session): void`, que redirige a `/dashboard` si el panel está
  bloqueado y se llama en las server actions del panel salvo las de cuenta y logout.

**Comportamiento:**
- Layout: si `!canUsePanel`, renderiza `BillingGate` en lugar de `children`. El header, "Mi cuenta" y "Salir"
  quedan accesibles.
- `BillingGate` para el OWNER:
  - `AWAITING_FIRST_PAYMENT`: título "Esperando tu primer pago".
  - `BLOCKED`: "Tu suscripción tiene un pago pendiente".
  - Botón de MP según `mpStatus`: con `pending`, "Pagar con Mercado Pago" (`mpInitPoint`); con `authorized`, un
    texto que lo guía a cambiar el medio de pago desde su cuenta de MP; con `cancelled` o sin suscripción, nada.
  - Aviso "Pagá con la cuenta de Mercado Pago de <payerEmail>".
  - Datos de transferencia de `PlatformSettings` y botón de WhatsApp a `contactWhatsapp` con el texto
    "Hola, ya transferí la suscripción de <nombre>".
- `BillingGate` para un BARBER: "La barbería tiene un pago pendiente. Hablá con el dueño." Sin datos de pago.
- `GRACE`: banner para el OWNER, "No pudimos cobrar tu suscripción. Tenés hasta el <fecha> para regularizarla."
  Fecha: `paidUntil + 12 días`, en la timezone de la barbería. El `planBanner` actual queda solo para `EXEMPT`.

- [ ] **Paso 1: tests (tienen que fallar primero)**
  - Con `BLOCKED`, `getPublicBarbershop(slug)` devuelve la barbería y la server action de reserva pública crea el
    turno (foco n.º 2).
  - Con `AWAITING_FIRST_PAYMENT`, `getPublicBarbershop` devuelve `null`.
  - Con `SUSPENDED` y `PAID`, devuelve `null` y el login rechaza al usuario (foco n.º 3).
  - Con `EXEMPT` y `planExpiresAt` vencido, todo funciona como hoy (lo cubren los tests de `planBanner`).
  - `requirePanelAccess` redirige con `BLOCKED` y `AWAITING_FIRST_PAYMENT`, y no hace nada con los otros 3 estados.
- [ ] **Paso 2:** correr los tests → FAIL.
- [ ] **Paso 3:** implementar. Leé `node_modules/next/dist/docs/01-app/` (caching y `Suspense`) antes de tocar el layout.
- [ ] **Paso 4:** los 4 checks en verde. Commit.

### Job 026-mercadopago-webhook: cliente de MP y webhook · depende de: 024

**Archivos:**
- Crear: `src/lib/mercadopago.ts`, `src/lib/mercadopago-signature.ts`, `src/lib/mercadopago-signature.test.ts`,
  `src/app/api/webhooks/mercadopago/route.ts`, `src/server/mercadopago-webhook.ts`,
  `src/server/mercadopago-webhook.test.ts`.
- Modificar: `.env.example`.

**Interfaces:**
- Consume: `recordPayment` (024).
- Produce (`src/lib/mercadopago.ts`, `server-only`, con `fetch` a `https://api.mercadopago.com` y Bearer
  `MP_ACCESS_TOKEN`):
  ```ts
  export type MpPreapproval = { id: string; status: string; init_point: string; payer_email: string;
    external_reference: string | null; auto_recurring: { transaction_amount: number; currency_id: string } };
  export async function createPreapproval(input: { barbershopId: string; reason: string; payerEmail: string;
    amount: string }): Promise<MpPreapproval>;   // status "pending", frequency 1 months, ARS, back_url = APP_BASE_URL/dashboard
  export async function getPreapproval(id: string): Promise<MpPreapproval>;
  export async function updatePreapprovalAmount(id: string, amount: string): Promise<MpPreapproval>;
  export async function cancelPreapproval(id: string): Promise<MpPreapproval>;
  export async function getPayment(id: string): Promise<{ id: string; status: string; transaction_amount: number;
    date_approved: string | null; preapprovalId: string | null; externalReference: string | null }>;
  export async function getAuthorizedPayment(id: string): Promise<{ id: string; preapproval_id: string;
    paymentId: string | null; paymentStatus: string | null }>;
  export class MpError extends Error { status: number }
  ```
  - `src/lib/mercadopago-signature.ts`: `verifyMpSignature(input: { xSignature: string | null; xRequestId: string | null; dataId: string; secret: string }): boolean`.
    Arma el manifiesto `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`, calcula el HMAC-SHA256 y compara con
    `timingSafeEqual`. **Confirmá el formato exacto con el MCP** antes de implementar.
  - `src/server/mercadopago-webhook.ts`: `handleMpNotification(n: { type: string; dataId: string }): Promise<"processed" | "ignored">`.

**Comportamiento del webhook:**
1. La ruta valida la firma: si es inválida, responde 401 sin tocar la DB.
2. Si es válida, llama a `handleMpNotification` y responde 200, también cuando el resultado es `"ignored"`. Un
   error inesperado se loguea y responde 500, para que MP reintente.
3. `subscription_preapproval`: hace `getPreapproval`, busca la barbería por `mpPreapprovalId` y actualiza
   `mpStatus`. Si no la encuentra, `"ignored"`.
4. `payment` y `subscription_authorized_payment`: resuelve el id del pago, hace `getPayment` y, si
   `status === "approved"`, ubica la barbería por `preapprovalId` y llama a
   `recordPayment({ source: "MERCADOPAGO", months: 1, mpPaymentId: payment.id, amount, paidAt: date_approved })`.
5. Cualquier otro tipo, `"ignored"`.

- [ ] **Paso 1: tests (tienen que fallar primero)**
  - `verifyMpSignature`: con firma válida, `true`; con un byte cambiado, `false`; sin header, `false`; con `ts`
    faltante, `false`.
  - `handleMpNotification`, con el cliente de MP mockeado:
    - pago aprobado de una suscripción conocida → `recordPayment` se llama una vez con `mpPaymentId`;
    - pago `rejected` → no se registra ningún pago y devuelve `"processed"`;
    - preapproval desconocido → `"ignored"`;
    - tipo `merchant_order` → `"ignored"` (foco n.º 4);
    - `subscription_preapproval` con `cancelled` → `mpStatus` queda `"cancelled"`.
  - Ruta: firma inválida → 401 y `handleMpNotification` no se llama.
- [ ] **Paso 2:** correr los tests → FAIL. Implementar. Los 4 checks en verde.
- [ ] **Paso 3:** smoke test manual en sandbox, documentado en `build.md`:
  - crear un vendedor y un comprador de prueba (MCP `create_test_user`);
  - exponer el puerto del worktree con un túnel y registrar la URL (MCP `save_webhook`);
  - crear un preapproval, pagarlo y verificar que se extendió `planExpiresAt`;
  - anotar si MP exigió que el mail del comprador coincida con `payer_email` (es la duda abierta del diseño).
- [ ] **Paso 4:** commit.

### Job 027-admin-billing: gestión del cobro en el admin · depende de: 024, 026

**Archivos:**
- Modificar: `src/app/admin/(panel)/barbershops/[id]/page.tsx`, `edit-form.tsx` (oculta `planExpiresAt` si
  `billingEnabled`), `status-form.tsx` (advertencia "la suscripción sigue cobrando" si `mpStatus = authorized`),
  `src/server/actions/admin.ts` (`createBarbershop` crea con `billingEnabled: true`), `src/server/queries/admin.ts`,
  `src/app/admin/(panel)/layout.tsx` (link a Ajustes), `src/app/admin/(panel)/page.tsx` (columna de estado de cobro).
- Crear: `src/app/admin/(panel)/barbershops/[id]/billing/*.tsx` (sección y formularios),
  `src/server/actions/admin-billing.ts`, `src/lib/admin-billing.ts` (esquemas Zod) con su test,
  `src/app/admin/(panel)/settings/page.tsx` y su formulario.

**Interfaces:**
- Consume: `createPreapproval`, `updatePreapprovalAmount`, `cancelPreapproval`, `MpError` (026); `recordPayment`,
  `billingState` (024).
- Produce (server actions, todas con sesión de admin + Zod):
  - `generateSubscriptionLink(prev, formData)` recibe `id`, `amount` y `payerEmail` (por defecto el del dueño). Si
    ya hay un preapproval no cancelado, primero lo cancela. Guarda `mpPreapprovalId`, `mpInitPoint`, `mpStatus`,
    `monthlyAmount` y `payerEmail`.
  - `changeSubscriptionAmount(prev, formData)`.
  - `setBillingEnabled(prev, formData)`. Al desactivar, primero cancela en MP; si MP falla, devuelve el error sin
    cambiar nada (foco n.º 5). Al activar con `planExpiresAt` null, exige `confirm=1`, porque se despublica la landing.
  - `registerManualPayment(prev, formData)` recibe `id`, `amount`, `paidAt` (fecha), `months` (1–12, por defecto
    1) y `note`.
  - `markDuplicateReviewed(prev, formData)`.
  - `updatePlatformSettings(prev, formData)`.
- La sección "Suscripción" de la ficha muestra:
  - el estado de cobro, el estado en MP y "pagado hasta";
  - el monto, y el link con botón de copiar y el aviso del mail;
  - los botones Generar / Regenerar link, Cambiar monto y Registrar pago manual, y el toggle de cobro;
  - el historial de pagos (fecha, origen, monto, hasta cuándo cubre, nota), con el badge "posible cobro doble" y el
    botón "Marcar revisado".

- [ ] **Paso 1: tests (tienen que fallar primero)**
  - Esquemas Zod: monto mayor a 0 y con 2 decimales como máximo; `months` entre 1 y 12; mail válido.
  - `setBillingEnabled(false)` con `cancelPreapproval` que lanza `MpError` → la barbería queda con
    `billingEnabled=true` y la acción devuelve un error (foco n.º 5).
  - `generateSubscriptionLink` con un preapproval previo → llama a `cancelPreapproval` antes de
    `createPreapproval`.
  - `createBarbershop` → la barbería nueva tiene `billingEnabled=true` y estado `AWAITING_FIRST_PAYMENT`.
- [ ] **Paso 2:** correr los tests → FAIL. Implementar. Los 4 checks en verde. Commit.

## Orden en Factory

`024` primero. Después, `025` y `026` en paralelo: sus scopes no chocan, siempre que 026 no toque
`src/lib/auth.ts` ni el layout. Por último, `027`.
