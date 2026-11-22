# Gestión del cobro en el admin

**Pedido:** 027-admin-billing: Sección "Suscripción" en la ficha de la barbería del admin (monto, generar/regenerar link con mail del pagador, cambiar monto, activar/desactivar cobro con cancelación en MP, pago manual por transferencia, historial con alerta de cobro doble), Ajustes de la plataforma (alias/CBU/titular/WhatsApp), barberías nuevas nacen con cobro activado y `planExpiresAt` deja de editarse a mano. · área: `src/app/admin/**`, `src/server/actions/admin*.ts`, `src/server/queries/admin.ts`, `src/lib/admin-billing*.ts` · depende de: 024, 026

## Contexto

Fuentes (decisiones tomadas, no se rediscuten): plan `docs/superpowers/plans/2026-11-21-suscripcion-mercadopago.md`
("Job 027-admin-billing", "Restricciones globales" y foco de review n.º 5) y diseño
`docs/superpowers/specs/2026-11-21-suscripcion-mercadopago-design.md` (secciones "Admin", "Pago manual y suscripción
de MP conviven" y "Decisiones tomadas en la revisión"). Las firmas de las server actions salen del plan.

**Ya en `main` (024, 025, 026). Usá estas firmas reales:**
- Schema (sin cambios en este job): `Barbershop` tiene `billingEnabled`, `monthlyAmount Decimal?(12,2)`,
  `mpPreapprovalId String? @unique`, `mpInitPoint`, `mpStatus`, `payerEmail`, `planExpiresAt` ("pagado hasta") y
  `timezone`. `SubscriptionPayment` tiene `source`, `amount`, `paidAt`, `coversUntil`, `mpPaymentId`, `note`,
  `createdByAdminId`, `suspectedDuplicate` y `duplicateReviewedAt`. `PlatformSettings` es una fila única
  (`id = "singleton"`) con `transferAlias`, `transferCbu`, `transferHolder` y `contactWhatsapp`. Todo lo que pide
  la feature entra en estos campos: **no hace falta schema nuevo**.
- `src/lib/billing.ts`: `billingState({ billingEnabled, paidUntil }, now)` → `EXEMPT | AWAITING_FIRST_PAYMENT |
  PAID | GRACE | BLOCKED`, e `isPubliclyVisible(state)`.
- `src/server/billing.ts`: `recordPayment({ barbershopId, source, amount: string, paidAt, months, mpPaymentId?,
  note?, createdByAdminId? })` → `{ created, paidUntil }`. Es el **único** camino que mueve `planExpiresAt` con el
  cobro activado. No es "use server" y no se re-exporta desde un archivo "use server" (nit 3 de la review de
  seguridad del 024): se llama **solo** desde una acción de admin que ya validó con Zod y con la sesión de admin.
- `src/lib/mercadopago.ts` (`server-only`): `createPreapproval({ barbershopId, reason, payerEmail, amount })`,
  `updatePreapprovalAmount(id, amount)`, `cancelPreapproval(id)`, todas → `MpPreapproval { id, status, init_point,
  payer_email, ... }`, y `MpError` (con `status`). Los montos se pasan como string decimal.
- `src/server/queries/platform-settings.ts`: `getPlatformSettings()`.
- Admin actual: `src/server/actions/admin.ts` (patrón: Zod `safeParse` → `getAdminSession()` → query; mensajes
  `UNAUTHORIZED`, `INVALID`, `NOT_FOUND`; `ActionResult` de `@/lib/barbershop-settings`; invalida la landing con
  `updateTag(barbershopBrandingTag(slug))` y `revalidatePath("/admin")`). `src/lib/platform-admin.ts` tiene
  `barbershopIdField`, `emailField`, `planExpiresAtFromDate`, `formatDateAR`. Ficha:
  `src/app/admin/(panel)/barbershops/[id]/{page,edit-form,status-form,access-link-form}.tsx`.
  `access-link-form.tsx` ya tiene un patrón de "copiar link".
- Patrón de tests contra DB: `src/server/billing-access.test.ts` y `src/server/mercadopago-webhook.test.ts`
  (`import "dotenv/config"`, barbería con slug aleatorio por test, borrado al final; `vi.mock("server-only")`,
  `next/headers`, `next/navigation`; `@/lib/mercadopago` mockeado). Para testear las acciones, mockeá
  `@/lib/admin-auth` (`getAdminSession`), `next/cache` y `@/app/[slug]/data` si hace falta.

**Docs de Next 16 que tiene que leer el builder** (`node_modules/next/dist/docs/01-app/`):
`01-getting-started/07-mutating-data.md`, `02-guides/forms.md`, `02-guides/data-security.md` y
`01-getting-started/08-caching.md` (las páginas nuevas leen la sesión y la DB dentro de `<Suspense>`, como la
ficha actual).

**Comportamiento de las acciones** (en `src/server/actions/admin-billing.ts`, "use server", todas
`(prev, formData) → ActionResult`, con Zod `safeParse` → sesión de admin → query; esquemas en
`src/lib/admin-billing.ts`):
- `generateSubscriptionLink`: recibe `id`, `amount` y `payerEmail` (en la UI, por defecto el del dueño). Si hay un
  `mpPreapprovalId` con `mpStatus` distinto de `cancelled`, primero llama a `cancelPreapproval`. Si esa cancelación
  falla, devuelve error y no crea nada. Después llama a `createPreapproval` y guarda `mpPreapprovalId`,
  `mpInitPoint`, `mpStatus`, `monthlyAmount` y `payerEmail`. Si el create falla después de cancelar, deja
  `mpStatus = "cancelled"` y devuelve error.
- `changeSubscriptionAmount`: recibe `id` y `amount`. Si hay un preapproval no cancelado, llama primero a
  `updatePreapprovalAmount`. Si MP falla, `monthlyAmount` no cambia. Si no hay preapproval, solo guarda
  `monthlyAmount`.
- `setBillingEnabled`: recibe `id`, `enabled` y `confirm`. Al desactivar con un preapproval no cancelado, primero
  `cancelPreapproval`; si MP falla, no cambia nada y devuelve el error (foco n.º 5). Si sale bien, queda
  `billingEnabled=false` y `mpStatus="cancelled"`. Al activar con `planExpiresAt` null, exige `confirm=1` (la
  landing se despublica). Invalida la landing.
- `registerManualPayment`: recibe `id`, `amount`, `paidAt` ("YYYY-MM-DD", no posterior al día de negocio de hoy
  en la timezone de la barbería), `months` (1–12, default 1) y `note` (opcional). Llama a `recordPayment` con
  `source: "MANUAL"` y `createdByAdminId` = el admin de la sesión. No toca MP. Rechaza si `billingEnabled` es false.
  Invalida la landing, porque `AWAITING_FIRST_PAYMENT` pasa a `PAID`.
- `markDuplicateReviewed`: recibe `id` (barbería) y `paymentId`. Setea `duplicateReviewedAt` solo si el pago es de
  esa barbería y tiene `suspectedDuplicate`.
- `updatePlatformSettings`: hace upsert de la fila `singleton`. Los campos son opcionales, se recortan y el vacío
  pasa a null. Si viene el CBU/CVU, tiene que tener 22 dígitos. El WhatsApp acepta dígitos, espacios, `+` y `-`.
- **Errores:** `MpError` y cualquier error de `recordPayment` se loguean con `console.error` y llegan a la UI como
  mensajes genéricos en español (por ejemplo, "No pudimos hablar con Mercado Pago. No se cambió nada, probá de
  nuevo."). Nunca se muestra `error.message` crudo, ni el status de MP, ni ids.

## Criterios de aceptación

- **AC-1** `src/lib/admin-billing.test.ts` cubre los esquemas Zod:
  - el monto se acepta si es mayor a 0 y tiene hasta 2 decimales (`"15000"`, `"15000.5"`); se rechazan `"0"`,
    `"-1"`, `"15000.123"`, `"abc"` y `""`;
  - `months` se acepta entre 1 y 12, vale 1 si falta, y se rechazan 0, 13 y `1.5`;
  - `payerEmail` tiene que ser un mail válido;
  - `paidAt` tiene que ser una fecha `YYYY-MM-DD` válida;
  - el CBU/CVU, si viene, tiene que tener 22 dígitos.
- **AC-2 (foco n.º 5)** En `src/server/actions/admin-billing.test.ts`, contra la DB, con `@/lib/mercadopago`
  mockeado y sesión de admin mockeada:
  - `setBillingEnabled` con `enabled=false`, sobre una barbería con `billingEnabled=true` y un preapproval
    `authorized`, con `cancelPreapproval` que lanza `MpError`: devuelve `{ ok: false }` con un mensaje genérico
    (sin el texto del `MpError`), y la barbería queda con `billingEnabled=true` y `mpStatus="authorized"`;
  - con `cancelPreapproval` que resuelve, queda `billingEnabled=false` y `mpStatus="cancelled"`;
  - activar una barbería con `planExpiresAt` null sin `confirm=1` devuelve error y no cambia nada; con `confirm=1`
    queda `billingEnabled=true`.
- **AC-3** En el mismo archivo, `generateSubscriptionLink` sobre una barbería con un preapproval previo no
  cancelado llama a `cancelPreapproval(<id viejo>)` **antes** que a `createPreapproval` (lo verifica el orden de
  llamadas de los mocks). Después guarda `mpPreapprovalId`, `mpInitPoint`, `mpStatus`, `monthlyAmount` y
  `payerEmail` nuevos. Si `cancelPreapproval` lanza, no se llama a `createPreapproval` y la barbería no cambia.
  `changeSubscriptionAmount` con `updatePreapprovalAmount` que lanza deja `monthlyAmount` como estaba.
- **AC-4** En el mismo archivo:
  - `registerManualPayment` sobre una barbería `AWAITING_FIRST_PAYMENT` crea un `SubscriptionPayment` con
    `source=MANUAL`, `createdByAdminId` del admin de la sesión y los `months` pedidos, deja la barbería en `PAID` y
    no llama a ninguna función de MP;
  - con `paidAt` futuro, o sobre una barbería con `billingEnabled=false`, devuelve error y no crea el pago;
  - `markDuplicateReviewed` con un `paymentId` de **otra** barbería no modifica ese pago;
  - **sin sesión de admin**, cualquiera de las seis acciones devuelve `{ ok: false }` y no toca ni la DB ni los
    mocks de MP.
- **AC-5** `createBarbershop`, testeado contra la DB en `src/server/actions/admin.test.ts`, crea la barbería con
  `billingEnabled=true`, y `billingState` da `AWAITING_FIRST_PAYMENT`. En el mismo test, `updateBarbershop` sobre
  una barbería con `billingEnabled=true` **ignora** `planExpiresAt` (la fecha no cambia). Con `billingEnabled=false`
  la sigue guardando como hoy.
- **AC-6** UI de la ficha `/admin/barbershops/[id]`:
  - la tarjeta "Suscripción" muestra el estado de cobro (badge), el `mpStatus`, "pagado hasta", el monto en ARS
    (`Intl.NumberFormat("es-AR", …)`), y el `mpInitPoint` con botón de copiar y el aviso de que hay que pagar con la
    cuenta de MP de `payerEmail`;
  - tiene los formularios Generar link (o Regenerar, si ya hay uno), Cambiar monto y Registrar pago manual, y el
    toggle de cobro, que pide confirmación cuando corresponde;
  - el historial de pagos muestra fecha, origen, monto, "cubre hasta" y nota, con el badge "Posible cobro doble" y
    el botón "Marcar revisado" en los pagos con `suspectedDuplicate` sin revisar;
  - `edit-form.tsx` oculta el campo `planExpiresAt` si `billingEnabled`;
  - `status-form.tsx` muestra la advertencia "la suscripción sigue cobrando" si `mpStatus = "authorized"`;
  - el listado `/admin` tiene una columna con el estado de cobro.

  Se verifica a mano en `pnpm dev`, a 375 px de ancho.
- **AC-7** `/admin/settings` (con un link "Ajustes" en el header del layout del admin) carga y guarda alias,
  CBU/CVU, titular y WhatsApp con `updatePlatformSettings`. Sin sesión de admin, redirige a `/admin/login`. Los
  valores guardados se ven en la pantalla de pago del dueño, que ya existe desde el job 025.
- **AC-8** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `src/lib/admin-billing.ts`
- `src/lib/admin-billing.test.ts`
- `src/server/actions/admin-billing.ts`
- `src/server/actions/admin-billing.test.ts`
- `src/server/actions/admin.ts`
- `src/server/actions/admin.test.ts`
- `src/server/queries/admin.ts`
- `src/app/admin/(panel)/layout.tsx`
- `src/app/admin/(panel)/page.tsx`
- `src/app/admin/(panel)/billing-badge.tsx`
- `src/app/admin/(panel)/barbershops/[id]/page.tsx`
- `src/app/admin/(panel)/barbershops/[id]/edit-form.tsx`
- `src/app/admin/(panel)/barbershops/[id]/status-form.tsx`
- `src/app/admin/(panel)/barbershops/[id]/billing/**`
- `src/app/admin/(panel)/settings/**`

## Fuera de alcance
- Cambios de schema o migraciones.
- Tocar `src/server/billing.ts`, `src/lib/mercadopago.ts`, `src/lib/billing.ts`, el webhook o la pantalla de pago
  del dueño (025). Si algo de eso parece faltar, anotalo en `build.md`, no lo cambies.
- Sincronizar `mpStatus` desde MP con `getPreapproval` ("refrescar estado"): eso lo hace el webhook.
- Reembolsos, borrar o editar pagos registrados, y pagos manuales que cancelen o pausen la suscripción de MP.
- Que suspender la barbería (`status`) toque MP: solo se muestra la advertencia.
- Componentes nuevos de shadcn (`src/components/ui/**`) y dependencias nuevas. Usá `button`, `card`, `input`,
  `label` y `badge`, que ya están, y elementos nativos (`<select>`, `<input type="checkbox">`, `<details>`).
- Smoke test en el sandbox de MP.

## Riesgos
- **Dinero:** el monto viaja como string decimal validado (nunca `number` para guardar). Con el cobro activado, el
  pago manual es la única vía que mueve `planExpiresAt`, y `updateBarbershop` tiene que ignorarlo **del lado del
  servidor**, no solo ocultarlo en la UI.
- **Foco n.º 5:** si MP falla al cancelar, no se aplica ningún cambio local. Lo mismo vale al regenerar: nunca dos
  preapprovals activos.
- **Auth:** las seis acciones nuevas son endpoints públicos por ser "use server". Cada una valida con Zod y
  `getAdminSession()` antes de cualquier lectura o llamada a MP. `recordPayment` no se exporta desde el archivo
  "use server".
- **Otros tenants:** `markDuplicateReviewed` filtra por `barbershopId` y por `paymentId`. Los errores de MP o de
  billing no llegan crudos a la UI.
- **Visibilidad pública:** activar el cobro, desactivarlo o registrar un pago cambia si la landing se publica.
  Hay que invalidar `barbershopBrandingTag(slug)`.
- Sin dependencias nuevas ni hot files.
