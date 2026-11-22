# Build: 026-mercadopago-webhook
**Rama:** factory/026-mercadopago-webhook · **Commit:** 2a935b4 · **Worktree:** .worktrees/026-mercadopago-webhook

Commits: `e3e138d` (billing cross-tenant) · `ad4d841` (cliente MP + firma) · `bcc53a2` (handler) · `2a935b4` (ruta + `.env.example`).

## Qué cambió
- `src/server/billing.ts`: agrega `MpPaymentConflictError` (mensaje genérico, sin `barbershopId` ni monto). El chequeo de la transacción y el fallback por P2002 (`currentPaidUntil`) ahora comparan `barbershopId`. Si el pago es de otra barbería, lanzan y no devuelven el `coversUntil` ajeno.
- `src/server/billing.test.ts`: 2 tests nuevos contra la DB, uno por el chequeo de la transacción y otro por el fallback P2002 con el `findUnique` "ciego".
- `src/lib/mercadopago-signature.ts`: `verifyMpSignature({ xSignature, xRequestId, dataId, secret })` con HMAC-SHA256 y `timingSafeEqual`. Nunca lanza. `dataId` acepta `string | null` (amplía la firma del plan sin romperla) para quitar el tramo `id:` cuando falta.
- `src/lib/mercadopago-signature.test.ts`: 8 tests (AC-1).
- `src/lib/mercadopago.ts`: cliente `server-only` con `fetch`. Incluye `createPreapproval`, `getPreapproval`, `updatePreapprovalAmount`, `cancelPreapproval`, `getPayment`, `getAuthorizedPayment` y `MpError { status }`, con las firmas del plan. El token y `APP_BASE_URL` se leen al llamar. Cada request corta a los 10 s (`AbortSignal.timeout`). Los mensajes de error solo llevan status, método y path, nunca el token ni el body de MP.
- `src/lib/mercadopago.test.ts`: 7 tests (AC-6) con `fetch` stubbeado y `server-only` mockeado.
- `src/server/mercadopago-webhook.ts`: `handleMpNotification({ type, dataId })`. La barbería se resuelve solo por el `id` del recurso consultado a MP. `MpPaymentConflictError` se registra con `console.error` y devuelve `"ignored"`. El resto de los errores se propaga.
- `src/server/mercadopago-webhook.test.ts`: 12 tests (AC-2 y AC-3), con el cliente MP y `recordPayment` mockeados y las barberías en la DB.
- `src/app/api/webhooks/mercadopago/route.ts`: `POST`. Si falta el secreto responde 503. Con firma inválida, 401. Con body no JSON, sin `data.id`, con `data.id` del body distinto del firmado o sin `type`, responde 400. Con firma válida, 200 (aunque el resultado sea `"ignored"`). Ante un error inesperado responde 500 con el texto "Internal error" y el detalle va a `console.error`.
- `src/app/api/webhooks/mercadopago/route.test.ts`: 6 tests (AC-4).
- `.env.example`: agrega `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y `APP_BASE_URL` vacías, con comentarios sobre las credenciales de prueba y las de producción.

## Datos de MP (confirmados por el orquestador con el MCP oficial)
1-2. **Firma** (https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/your-integrations/notifications/webhooks):
   - `x-signature: ts=<ts>,v1=<hex>`: el header se separa por `,` y cada parte por `=` (se toleran espacios). `x-request-id` llega en un header aparte.
   - El manifiesto es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` y termina en `;`. `data.id` sale del **query param** y se pasa a minúsculas si es alfanumérico. Si falta `data.id` o `x-request-id`, **se quita** su tramo. Implementado así.
   - El HMAC-SHA256 en hex usa la clave secreta de Webhooks, no el access token.
3. **Body:** `type`, `action`, `data.id`, `id`, `live_mode`, `date_created`, `user_id` y `api_version`. Hay que responder 200/201 en menos de 22 s, porque MP reintenta cada 15 min. `type` también puede venir como query param: la ruta usa `body.type` y, si falta, el query `type`. El `data.id` que se procesa es siempre el del query, porque es el que cubre la firma. Si el body trae otro, la ruta responde 400.
4. **`GET /authorized_payments/{id}`: SUPUESTO a validar en sandbox.** La doc no detalla el body. Se lee de forma defensiva `id`, `preapproval_id` y el pago asociado en `payment.id` / `payment.status` (si falta, `paymentId: null` y la notificación se ignora).
5. **`GET /v1/payments/{id}`** (https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/payment-management) trae `id`, `status`, `status_detail`, `date_approved`, `transaction_amount` y `operation_type` (`recurring_payment`). **SUPUESTO:** la doc no documenta el campo del preapproval. `preapprovalId` se toma de `metadata.preapproval_id` o de `point_of_interaction.transaction_data.subscription_id`, si vienen. Consecuencia:
   - **tópico `payment`**: si el pago no trae ninguno de los dos campos, devuelve `"ignored"`;
   - **tópico `subscription_authorized_payment`** (camino principal): usa el `preapproval_id` de la cuota cuando `/v1/payments` no lo trae. Si los dos lo traen y difieren, se registra como anomalía y devuelve `"ignored"`.

   El `mpPaymentId` es siempre el id del pago que devuelve `/v1/payments`, nunca el de la cuota.
- `GET /preapproval/{id}` y la cancelación con `PUT { status: "cancelled" }` siguen la hipótesis del spec (n.º 3), que el orquestador no contradijo. También quedan para validar en sandbox.
- **Anti-replay por `ts`:** no se implementó (está fuera de alcance). La protección es la idempotencia: se vuelve a consultar el recurso y `mpPaymentId` es `@unique`.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `src/lib/mercadopago-signature.test.ts`, 8 tests. Cubren la firma válida, un byte cambiado, header null o vacío, sin `ts`, sin `v1`, otro `dataId`, otro request-id, otro `ts`, otro o vacío `secret`, y largo distinto o no hex (false sin lanzar). También el tramo omitido y las minúsculas. |
| AC-2 | ✅ | `src/server/mercadopago-webhook.test.ts`: pago aprobado (llamada exacta con `amount: "15000.50"`), cuota a pago con el mismo `mpPaymentId` por los dos tópicos, `rejected`, sin preapproval o con uno ajeno, cuota sin pago, y `merchant_order` y otros tipos sin llamar al cliente. |
| AC-3 | ✅ | Mismo archivo. `cancelled` se verifica en la DB y otra barbería no cambia. Un preapproval desconocido no cambia nada. La barbería sale del `id` devuelto por MP, no del `dataId`. `MpPaymentConflictError` se registra con `console.error` y devuelve `"ignored"`. |
| AC-4 | ✅ | `route.test.ts`: sin o con firma inválida, 401 sin llamar al handler. Sin secreto, 503. Con firma válida, 200 (también `"ignored"`). Body no JSON, `[]`, sin `data.id` o con `data.id` distinto: 400. Si el handler lanza, 500 con un body sin `shop_abc` ni `123`. |
| AC-5 | ✅ | `billing.test.ts`: con el mismo X en B, rechaza con `MpPaymentConflictError` (el mensaje no tiene ids ni monto) y B no cambia `planExpiresAt` ni suma pagos. Con A sigue `{ created: false }`. El fallback P2002 también rechaza. |
| AC-6 | ✅ | `mercadopago.test.ts`: URL, método, Bearer y body exactos de `createPreapproval`. PUT para monto y cancelación. Con un status fuera de 2xx y con error de red, `MpError` sin el token. Se importa sin variables. `pnpm build` pasó con `env -u MP_ACCESS_TOKEN -u MP_WEBHOOK_SECRET -u APP_BASE_URL`. |
| AC-7 | ⏸ pendiente | No hay credenciales de MP en `.env` ni MCP de MP en esta sesión. Abajo quedan los pasos. No bloquea. |
| AC-8 | ✅ | Ver Checks. |

**Prueba manual con curl** (dev en :3002 con `MP_WEBHOOK_SECRET=dev-secret` y la firma calculada con `openssl dgst -hmac`):
- sin firma: 401 `Unauthorized`;
- firma inválida: 401;
- `merchant_order` con firma válida: 200 `OK`;
- body `nope` con firma válida: 400;
- `payment` con firma válida y sin `MP_ACCESS_TOKEN`: 500 `Internal error` (el log muestra el `MpError`, la respuesta no);
- `GET`: 405.

## AC-7: smoke test en sandbox (pendiente)
1. En `.env` del worktree: `MP_ACCESS_TOKEN=<TEST-... del vendedor de prueba>`, `APP_BASE_URL=<URL del túnel>` y `MP_WEBHOOK_SECRET=<clave secreta de Webhooks del vendedor de prueba>`.
2. MCP `create_test_user`: un vendedor y un comprador (siteId MLA).
3. `pnpm dev --port 3002` y un túnel (p. ej. `cloudflared tunnel --url http://localhost:3002`).
4. MCP `save_webhook` con `<túnel>/api/webhooks/mercadopago` y los tópicos `subscription_preapproval`, `subscription_authorized_payment` y `payment`. Copiar la clave secreta a `MP_WEBHOOK_SECRET`.
5. En una barbería de la DB del worktree con `billingEnabled=true`, crear el preapproval con `createPreapproval({ barbershopId, reason, payerEmail: <mail del comprador de prueba>, amount: "100.00" })` (con un script `tsx`, o desde 027 cuando exista). Guardar `mpPreapprovalId = result.id` en la barbería.
6. Abrir `init_point` logueado como comprador de prueba y pagar con una tarjeta de prueba.
7. Verificar:
   - los logs de dev muestran 200 (no 401);
   - en la DB, `mpStatus = "authorized"`, hay un `SubscriptionPayment` con `mpPaymentId` igual al id del **pago** y `planExpiresAt` se extendió un mes.
8. Validar los supuestos 4 y 5: anotar el body real de `/authorized_payments/{id}` (¿`payment.id`?) y de `/v1/payments/{id}` (¿en qué campo viene el preapproval?). Si `/v1/payments` no lo trae, las notificaciones `payment` van a quedar como `"ignored"` (está bien, entra por la cuota).
9. Anotar si MP exigió que el mail del comprador coincida con `payer_email`.

## Checks
lint ✅ · typecheck ✅ · test ✅ (25 archivos, 396 tests) · build ✅ (sin variables de MP; `/api/webhooks/mercadopago` es `ƒ` dinámica)
