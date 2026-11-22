# Cliente de Mercado Pago y webhook de suscripciones

**Pedido:** 026-mercadopago-webhook: Cliente REST de Mercado Pago (preapproval: crear pendiente, leer, cambiar monto, cancelar; pagos) + webhook `/api/webhooks/mercadopago` con validación de `x-signature`, consulta del recurso e idempotencia; smoke test en sandbox con cuentas de prueba. **Seguimiento de la review de seguridad del 024:** `recordPayment` hoy deduplica `mpPaymentId` de forma global; si el pago ya existe en **otra** barbería debe lanzar/registrar anomalía en vez de devolver `created:false` en silencio (ajustar `src/server/billing.ts`), y el webhook no debe exponer los mensajes de error crudos (traen `barbershopId`/monto). · área: `src/server/billing.ts`, `src/lib/mercadopago*.ts`, `src/app/api/webhooks/**`, `src/server/mercadopago-webhook*.ts`, `.env.example` · depende de: 024

## Contexto

Fuentes: plan `docs/superpowers/plans/2026-11-21-suscripcion-mercadopago.md` (sección "Job 026", "Restricciones
globales" y foco de review n.º 4) y diseño `docs/superpowers/specs/2026-11-21-suscripcion-mercadopago-design.md`.
Las interfaces de `src/lib/mercadopago.ts`, `src/lib/mercadopago-signature.ts` y `handleMpNotification` están
definidas **textualmente en el plan**: respetá esas firmas, porque el job 027 las consume (`createPreapproval`,
`updatePreapprovalAmount`, `cancelPreapproval`, `MpError`).

**Lo que ya existe (job 024, en `main`):**
- `prisma/schema.prisma`: `Barbershop` tiene `billingEnabled`, `monthlyAmount`, `mpPreapprovalId String? @unique`,
  `mpInitPoint`, `mpStatus`, `payerEmail`, `planExpiresAt` ("pagado hasta") y `timezone`. `SubscriptionPayment`
  tiene `mpPaymentId String? @unique` (la llave de idempotencia). **Este job no cambia el schema.**
- `src/server/billing.ts`: `recordPayment(input)` es idempotente por `mpPaymentId`, con una transacción con
  `FOR UPDATE` y P2002 → `{ created: false }`. No importa `server-only` (a propósito, para tests y scripts).
  Hoy el chequeo `findUnique({ where: { mpPaymentId } })` (en la transacción y en el fallback `currentPaidUntil`)
  **no mira `barbershopId`**. Eso es lo que corrige este job (nit 1 de
  `factory/jobs/024-billing-core/round-1/review-security.md`). Los `throw new Error(...)` de `validate` y de
  "Barbería inexistente" llevan `barbershopId` y monto crudos (nit 2): se pueden quedar así para los logs, pero
  **nunca** salen en la respuesta HTTP del webhook.
- `src/server/billing.test.ts`: es el patrón de tests contra la DB del worktree (`import "dotenv/config"`, una
  barbería por test con slug aleatorio y borrado en `afterEach`). Seguilo para los tests nuevos que usen DB.
- `src/proxy.ts`: el `matcher` solo toma rutas de un segmento (`/:slug([^/.]+)`), `/login`, las del panel y
  `/admin/**`. `/api/webhooks/mercadopago` tiene tres segmentos, así que **el proxy no la intercepta**. No hace
  falta tocar `src/proxy.ts`.
- No existe `src/app/api/`. El único route handler del repo es `src/app/media/[...path]/route.ts`; tomalo de
  referencia de estilo (devuelve `Response` con `text/plain` y `X-Content-Type-Options: nosniff`).
- `server-only` está en `package.json`. Ojo: en Vitest, importar un módulo que importa `server-only` falla. En los
  tests que importen `src/lib/mercadopago.ts`, mockealo con `vi.mock("server-only", () => ({}))`, o mockeá el
  módulo entero.

**Docs de Next 16 que tiene que leer el builder:**
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`

Los `POST` no se cachean. Con `cacheComponents: true`, no agregues `"use cache"` ni `dynamic = "force-static"`.
Para validar la firma, leé el body **una sola vez** (`await request.text()` y después `JSON.parse`).

**Hechos de Mercado Pago.** Consultá todo con el MCP `mercadopago` (`search_documentation`, siteId `MLA`, language
`es`), no con la web. El spec-writer **no tuvo el MCP disponible en su sesión**, así que lo que sigue se separa en
dos grupos:

- *Ya verificado con el MCP en el diseño aprobado:*
  - Preapproval sin plan con `status: "pending"`, `payer_email`, `external_reference`, `reason`, `back_url` y
    `auto_recurring` (`frequency: 1`, `frequency_type: "months"`, `transaction_amount`, `currency_id: "ARS"`). La
    respuesta trae `init_point`.
  - Cambio de monto: `PUT /preapproval/{id}` con `auto_recurring.transaction_amount` y `currency_id`.
  - Estados: `pending`, `authorized`, `paused` y `cancelled`.
  - Tópicos: `subscription_preapproval`, `subscription_authorized_payment` y `payment`. La notificación es solo una
    señal: hay que consultar el recurso por API, validar `x-signature`, responder 200/201 en menos de 22 s y
    procesar de forma idempotente.
- *A confirmar por el builder con el MCP antes de implementar.* Lo que sigue es la hipótesis de trabajo. Anotá en
  `build.md` lo que confirmes, con la URL de la doc, y lo que difiera:
  1. `x-signature` llega con el formato `ts=<ts>,v1=<hmac hex>`. El manifiesto es
     `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, donde `data.id` sale del **query param** `data.id` de la URL
     de la notificación (en minúsculas si es alfanumérico). Si falta un valor, ¿se omite ese tramo?
     El HMAC es SHA-256 con la clave secreta del webhook, en hex.
  2. Body de la notificación: `{ type, action, data: { id }, ... }`. Los query params son `type` y `data.id`.
  3. `GET /preapproval/{id}` devuelve `id`, `status`, `init_point`, `payer_email`, `external_reference` y
     `auto_recurring`. Cancelar es `PUT /preapproval/{id}` con `{ status: "cancelled" }`.
  4. `GET /authorized_payments/{id}` (cuota) devuelve `preapproval_id` y un objeto `payment` con `id` y `status`
     (puede venir vacío si la cuota todavía no se cobró).
  5. `GET /v1/payments/{id}`: confirmá **en qué campo viene el id del preapproval** de un pago de suscripción
     (`metadata.preapproval_id`, `point_of_interaction.transaction_data.subscription_id` u otro). De ese campo sale
     `preapprovalId` en `getPayment`.

## Criterios de aceptación

- **AC-1** Tests de `src/lib/mercadopago-signature.test.ts` para
  `verifyMpSignature({ xSignature, xRequestId, dataId, secret })`:
  - con una firma válida, calculada en el test con `node:crypto` sobre el manifiesto confirmado, da `true`;
  - con un byte cambiado en `v1`, con el header en `null`, sin `ts`, sin `v1`, con otro `dataId` o con otro
    `secret`, da `false`;
  - con un `v1` de largo distinto, da `false` sin lanzar. La comparación usa `timingSafeEqual`.
- **AC-2** `src/server/mercadopago-webhook.test.ts`, con `@/lib/mercadopago` mockeado, `recordPayment` espiado o
  mockeado y la DB del worktree para las barberías. `handleMpNotification({ type, dataId })` cumple esto:
  - `payment` aprobado de una barbería con ese `mpPreapprovalId`: `recordPayment` se llama **una vez** con
    `{ barbershopId, source: "MERCADOPAGO", months: 1, mpPaymentId: <id del pago>, amount: "<string con 2 decimales>", paidAt: new Date(date_approved) }`
    y devuelve `"processed"`;
  - `subscription_authorized_payment`: resuelve el pago con `getAuthorizedPayment` y `getPayment`, y llama a
    `recordPayment` con el **id del pago**, no el de la cuota. El mismo pago notificado por los dos tópicos llega
    a `recordPayment` con el mismo `mpPaymentId`;
  - pago `rejected`: no se llama a `recordPayment` y devuelve `"processed"`;
  - pago sin `preapprovalId` o con un preapproval que no es de ninguna barbería: devuelve `"ignored"`;
  - cuota sin pago asociado todavía: devuelve `"ignored"`;
  - `merchant_order` o cualquier otro tipo: devuelve `"ignored"` sin llamar al cliente de MP (foco n.º 4).
- **AC-3** También en `src/server/mercadopago-webhook.test.ts`:
  - `subscription_preapproval` con `getPreapproval` en `status: "cancelled"`: el `mpStatus` de la barbería con ese
    `mpPreapprovalId` queda en `"cancelled"` (se verifica en la DB) y devuelve `"processed"`;
  - si el preapproval es desconocido, devuelve `"ignored"` y no cambia ninguna barbería;
  - la barbería se busca por el `id` del recurso consultado a MP, nunca por campos del body de la notificación;
  - si `recordPayment` lanza el error de pago de otra barbería (AC-5), el handler lo registra como anomalía con
    `console.error` y devuelve `"ignored"`, sin relanzarlo.
- **AC-4** Test de la ruta en `src/app/api/webhooks/mercadopago/route.test.ts`. Importa `POST` y mockea
  `@/server/mercadopago-webhook`:
  - con firma inválida o sin `x-signature`: 401 y `handleMpNotification` **no** se llama;
  - sin `MP_WEBHOOK_SECRET` configurado: no se llama a `handleMpNotification` y la respuesta no es 2xx;
  - con firma válida: 200, también cuando el resultado es `"ignored"`;
  - con body que no es JSON o sin `data.id`: 4xx sin llamar al handler (con firma válida, si aplica);
  - si `handleMpNotification` lanza `new Error("Monto inválido: 123 de shop_abc")`: 500, y el body de la respuesta
    **no contiene** `"shop_abc"` ni `"123"` (es un texto genérico). El detalle solo va a `console.error`.
    Esto resuelve el nit 2 del 024.
- **AC-5** En `src/server/billing.test.ts`, contra la DB, se registra un pago de MP con `mpPaymentId` X en la
  barbería A. Después, `recordPayment` con el mismo X y la barbería B **rechaza** con un error exportado y
  distinguible (p. ej. `class MpPaymentConflictError`, sin `barbershopId` ni monto en `message`). La barbería B no
  cambia su `planExpiresAt` ni suma pagos. La misma llamada con A sigue devolviendo `{ created: false }` como hoy.
  El chequeo dentro de la transacción y el fallback por P2002 (`currentPaidUntil`) miran ahora `barbershopId`, y el
  fallback ya no devuelve el `coversUntil` de otra barbería. Esto resuelve el nit 1 del 024.
- **AC-6** Tests de `src/lib/mercadopago.test.ts`, con `fetch` mockeado (`vi.stubGlobal`) y `server-only`
  mockeado:
  - `createPreapproval` hace `POST https://api.mercadopago.com/preapproval` con `Authorization: Bearer <MP_ACCESS_TOKEN>`.
    El body lleva `status: "pending"`, `payer_email`, `external_reference = barbershopId`, `reason`,
    `back_url = ${APP_BASE_URL}/dashboard` y `auto_recurring { frequency: 1, frequency_type: "months", transaction_amount: <número del string>, currency_id: "ARS" }`;
  - `updatePreapprovalAmount` y `cancelPreapproval` usan `PUT /preapproval/{id}`;
  - si MP responde fuera de 2xx, se lanza `MpError` con `status`, y su `message` no incluye el token;
  - el token y la URL base se leen al llamar, no al importar el módulo: `pnpm build` pasa sin esas variables.

  `.env.example` documenta `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y `APP_BASE_URL`, vacías y con un comentario
  sobre las credenciales de prueba y de producción.
- **AC-7** Smoke test en sandbox (criterio manual y documentado). Si el `.env` tiene credenciales de prueba, el
  builder sigue el paso 3 del plan:
  - crea los usuarios de prueba con `create_test_user`;
  - abre un túnel al puerto del worktree y registra el webhook con `save_webhook`;
  - crea un preapproval, lo paga y verifica que se extendió `planExpiresAt`;
  - anota si MP exigió que el mail del comprador coincida con `payer_email`.

  Si no hay credenciales, deja en `build.md` los pasos exactos y "pendiente". Este AC no bloquea el job.
- **AC-8** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `src/lib/mercadopago.ts`
- `src/lib/mercadopago.test.ts`
- `src/lib/mercadopago-signature.ts`
- `src/lib/mercadopago-signature.test.ts`
- `src/server/mercadopago-webhook.ts`
- `src/server/mercadopago-webhook.test.ts`
- `src/server/billing.ts`
- `src/server/billing.test.ts`
- `src/app/api/webhooks/mercadopago/**`
- `.env.example`

## Fuera de alcance
- Cualquier UI: la sección "Suscripción" del admin, los botones de generar link y el pago manual son del job 027.
  La pantalla de bloqueo y los banners son del 025.
- Tocar `src/lib/auth.ts`, `src/app/(dashboard)/**`, `src/server/queries/**`, `src/server/**/booking.ts`,
  `src/server/actions/**` o `src/proxy.ts`. Todos están en el scope del 025 o son hot files que este job no necesita.
- Cambios de schema o migraciones. Por ejemplo, una tabla de anomalías o de eventos de webhook: la anomalía se
  registra con `console.error`.
- Agregar el SDK oficial de MP o cualquier dependencia (`package.json` / `pnpm-lock.yaml`): se usa `fetch`.
- Reembolsos, contracargos, `paused` con lógica propia, IPN viejo (`topic`/`id`) y `merchant_order`: se ignoran.
- Ventana anti-replay por `ts`. Es opcional: el reprocesamiento ya es idempotente, porque se vuelve a consultar el
  recurso y `mpPaymentId` es único. Si la doc de MP la recomienda, anotalo en `build.md` sin implementarla.
- Ubicar la barbería por `external_reference` cuando el `mpPreapprovalId` no coincide (por ejemplo, el pago de un
  preapproval viejo ya regenerado): se ignora y se loguea.

## Riesgos
- **Dinero e idempotencia:** el mismo pago llega por `payment` y por `subscription_authorized_payment`, o por los
  reintentos de MP. La protección es que `mpPaymentId` sea siempre el id del **pago** y nunca el de la cuota. El
  monto pasa de `number` a string decimal sin aritmética flotante (`toFixed(2)` sobre el valor recibido), y
  `recordPayment` lo valida.
- **Datos de otros tenants:**
  - la barbería se resuelve **solo** desde el recurso consultado a MP con nuestro token (`mpPreapprovalId`), nunca
    desde el body;
  - un `mpPaymentId` de otra barbería ahora lanza un error (AC-5) en lugar de pasar en silencio;
  - las respuestas HTTP no filtran `barbershopId`, montos ni mensajes internos.
- **Auth del webhook:** es una ruta pública sin sesión. La única defensa es la firma: sin secreto o con firma
  inválida no se toca la DB ni la API de MP. Si el formato del manifiesto se interpreta mal, se rechazarían todas
  las notificaciones legítimas. Por eso el builder confirma el formato con el MCP y, si puede, lo valida en el smoke
  test.
- **Reintentos de MP:** un 500 hace que MP reintente. Solo responden 500 los errores inesperados. Lo desconocido y
  la anomalía cross-tenant responden 200, para no generar un loop de reintentos.
- **Secretos:** `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` no se loguean ni aparecen en los mensajes de `MpError`.
- Dependencias nuevas: ninguna. Cambios de schema: ninguno.
