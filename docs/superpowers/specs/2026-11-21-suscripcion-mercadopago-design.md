# Suscripción automática con Mercado Pago — diseño

Fecha: 2026-11-21 · Estado: borrador para aprobar

## Intención

Hoy el cobro a las barberías es manual: el admin de la plataforma carga `plan` y `planExpiresAt` a mano y el
vencimiento solo muestra un banner. Queremos que el cobro mensual sea **automático** vía Mercado Pago, pero que
**el alta siga siendo gestionada por el admin**: nadie se suscribe solo. El admin crea la barbería, la vincula al
mail del dueño, define el **precio de esa barbería** y genera un link de suscripción que comparte él mismo
(WhatsApp, mail…). Si el pago falla, la barbería pierde el panel; si Mercado Pago no funciona para ese cliente,
puede pagar por **transferencia** y el admin lo registra a mano.

## Objetivos

- Precio mensual distinto por barbería, definido por el admin al generar el link.
- Link de suscripción generado desde el admin, atado al mail del dueño, para compartir a mano.
- Cobro recurrente mensual automático; cada pago aprobado extiende el período pagado sin intervención.
- Pago fallido (agotados los reintentos de MP + margen) → el dueño y los barberos pierden el panel, **pero la
  landing y las reservas siguen funcionando** para los clientes de la barbería.
- Barbería nueva nace "esperando pago": el panel muestra esa pantalla y la landing no está publicada hasta el
  primer pago (MP o manual).
- Pago manual por transferencia registrado por el admin: extiende el período y desbloquea.
- Historial de pagos por barbería (MP y manuales).

## No objetivos

- Alta o suscripción self-service desde la web pública.
- Stripe (no acepta cuentas de comercio argentinas sin entidad en el exterior).
- Catálogo de planes con precios fijos / planes de MP con link público.
- Facturación electrónica (AFIP), prorrateo, cupones, períodos de prueba.
- Que el sistema mande mails o WhatsApp propios (MP ya notifica al pagador).

## Anti-objetivos (sería un fracaso aunque "funcione")

- Que un cliente final no pueda reservar porque su barbería debe la suscripción.
- Que alguien con el link pueda suscribir una barbería que el admin no creó, o pagar por otra.
- Que un webhook duplicado o reenviado extienda dos veces el período.
- Que una barbería existente quede bloqueada al desplegar esto sin que el admin lo decida.

## Restricciones y hechos de Mercado Pago (verificados con el MCP oficial)

- Se usa **Suscripciones sin plan asociado, con pago pendiente**: `POST /preapproval` con `status: "pending"`,
  `payer_email`, `external_reference`, `reason`, `back_url` y `auto_recurring` (`frequency: 1`,
  `frequency_type: "months"`, `transaction_amount`, `currency_id: "ARS"`). La respuesta trae el `init_point`,
  que es el link a compartir. El pagador elige el medio de pago en MP.
- Cambio de monto: `PUT /preapproval/{id}` con `auto_recurring.transaction_amount` y `currency_id`.
- Estados de la suscripción: `pending`, `authorized`, `paused`, `cancelled`.
- Cobro rechazado: la cuota entra en reintentos, **hasta 4 dentro de una ventana de 10 días**. Tras **3 cuotas
  rechazadas MP da de baja la suscripción** y avisa al vendedor por mail.
- Webhooks: tópicos `subscription_preapproval` (alta/cambios de la suscripción),
  `subscription_authorized_payment` (cuotas) y `payment` (pagos). La notificación es solo una señal: hay que
  **consultar el recurso por API** antes de actuar, validar el header `x-signature` con la clave secreta,
  responder 200/201 en menos de 22 s y procesar de forma **idempotente** (MP reintenta y puede duplicar).
- La URL de webhook tiene que ser HTTPS pública (localhost no sirve; en desarrollo, túnel).
- No se puede probar pagándose a uno mismo: se usan **cuentas de prueba** de vendedor y comprador.
- **A verificar en sandbox:** si MP exige que el pagador esté logueado con una cuenta cuyo mail coincida con
  `payer_email`. La documentación no lo afirma de forma explícita, pero es un problema conocido; el pago manual es
  el respaldo y la UI avisa "pagá con la cuenta de Mercado Pago de <mail>".
- Los agentes de la factory (spec-writer, builder) deben consultar el **MCP de Mercado Pago** para todo lo de MP,
  no la web.

## Approaches considerados

1. **Una suscripción de MP (preapproval sin plan) por barbería — ELEGIDO.** Precio por cliente, cobro automático,
   link no público y atado al mail. Contra: posible exigencia de mail coincidente; se cubre con pago manual.
2. Link de pago único (Checkout Pro) generado cada mes. Sin problema del mail, pero no es automático: más
   suspensiones por olvido. Descartado.
3. Plan de MP con link público. Precio único y cualquiera con el link se suscribe: contradice el objetivo.
   Descartado.

## Diseño

### Dos ejes de estado, separados

- `status` (`ACTIVE` / `SUSPENDED`) **no cambia de significado**: es la suspensión manual del admin y corta todo
  (panel, landing, reservas), como hoy.
- Nuevo **estado de cobro**, derivado (no guardado) a partir de los datos de facturación y la hora actual:
  - `EXEMPT` — la barbería no tiene cobro activado (barberías existentes al desplegar; también útil para
    cortesías). Comportamiento actual.
  - `AWAITING_FIRST_PAYMENT` — cobro activado y nunca pagó. Panel: pantalla "Esperando tu primer pago".
    Landing y reservas **no publicadas**.
  - `PAID` — `paidUntil` ≥ ahora. Todo normal.
  - `GRACE` — venció `paidUntil` pero estamos dentro del margen. Panel normal con banner "tu pago falló / está
    pendiente" para el dueño. Landing y reservas normales.
  - `BLOCKED` — pasó `paidUntil + margen`. Panel bloqueado (pantalla de pago). **Landing y reservas siguen
    funcionando**; los turnos nuevos se guardan y el dueño los ve al desbloquear.
- Margen (`BILLING_GRACE_DAYS`): **12 días** (10 de reintentos de MP + 2). Constante en código.
- Calcularlo al vuelo evita un cron: no hace falta "suspender" en un momento exacto, basta con comparar fechas en
  cada request.

### Datos

- Reusar `Barbershop.planExpiresAt` como **"pagado hasta"** (`paidUntil` en este documento): ya significa eso.
- Nuevos campos de facturación por barbería (en `Barbershop` o en un modelo `Subscription` 1:1, a elección del
  builder): `billingEnabled` (bool, default `false` en la migración para las existentes; `true` al crear desde el
  admin), `monthlyAmount` (Decimal 12,2), `mpPreapprovalId`, `mpInitPoint`, `mpStatus`, `payerEmail` (el mail con el
  que se creó la suscripción).
- Nuevo modelo `SubscriptionPayment` (historial): `barbershopId`, `source` (`MERCADOPAGO` / `MANUAL`),
  `amount`, `paidAt`, `coversUntil` (el nuevo `paidUntil` que produjo), `mpPaymentId` (**único**, la llave de
  idempotencia), `note`, `createdByAdminId` (manuales). Solo se guardan pagos aprobados; los rechazos se ven en MP.
- Datos de transferencia de la plataforma (alias, CBU/CVU, titular, WhatsApp de contacto): se cargan una vez en el
  admin (modelo singleton `PlatformSettings`).

### Extensión del período

Con cada pago aprobado (MP o manual): `paidUntil = max(paidUntil, fecha de pago) + N meses` (N = 1 para MP; el
admin elige N en el pago manual, default 1), calculado en la timezone de la barbería. Si la barbería estaba
`BLOCKED` o `AWAITING_FIRST_PAYMENT`, queda `PAID` automáticamente.

### Admin (panel de plataforma)

En la ficha de la barbería, una sección **Suscripción**:
- Monto mensual y **"Generar link"**: crea el preapproval `pending` con `payer_email` = mail del dueño y
  `external_reference` = id de la barbería. Muestra el link con botón copiar y el aviso del mail.
- Estado de la suscripción en MP y estado de cobro derivado; "pagado hasta".
- **Cambiar monto** (PUT al preapproval). **Regenerar link** si el anterior quedó cancelado o el dueño cambió de
  mail (cancela el preapproval anterior antes de crear el nuevo: nunca dos activos).
- **Registrar pago manual**: monto, fecha, meses que cubre, nota.
- Historial de pagos.
- Toggle "cobro activado" para pasar una barbería existente de `EXEMPT` al flujo nuevo.

Pantalla global **Ajustes de la plataforma**: datos de transferencia y WhatsApp.

### Webhook

Ruta pública (p. ej. `/api/webhooks/mercadopago`): valida `x-signature`, responde rápido, consulta el recurso
(preapproval o pago autorizado/pago) con el access token, encuentra la barbería por `external_reference` /
`mpPreapprovalId`, actualiza `mpStatus` y, si hay un pago **aprobado** nuevo (no visto por `mpPaymentId`), registra
el `SubscriptionPayment` y extiende el período, todo en una transacción. Ignora lo que no reconoce.

### Pantallas del dueño

- `AWAITING_FIRST_PAYMENT` y `BLOCKED`: el layout del panel muestra **solo** la pantalla de pago (en vez del
  contenido), con: botón "Pagar con Mercado Pago" (el `init_point`), datos de transferencia, botón de WhatsApp
  ("Ya transferí") y el aviso del mail. "Mi cuenta" y "Salir" siguen accesibles.
- Barberos (`BARBER`) en esos estados: pantalla simple "La barbería tiene un pago pendiente, hablá con el dueño",
  sin datos de pago.
- `GRACE`: banner para el dueño (reemplaza/extiende el `planBanner` actual).
- El bloqueo se aplica en el servidor (server actions y queries del panel), no solo ocultando UI.

### Landing y reservas

Las queries públicas (`getPublicBarbershop`, slug-exists, creación de reservas) pasan de "solo `ACTIVE`" a
"`ACTIVE` y estado de cobro ≠ `AWAITING_FIRST_PAYMENT`". `BLOCKED` sigue publicada.

### Configuración

Variables de entorno: access token de MP, clave secreta de webhooks, URL pública base (para `back_url`). Separar
credenciales de prueba y producción.

### Decisiones tomadas en la revisión (marcadas como decisión del diseñador)

- **"Nunca pagó" = `planExpiresAt` es null.** Al activar el cobro en una barbería existente con fecha futura,
  queda `PAID` hasta esa fecha y después sigue el camino normal (margen → bloqueo). Si no tiene fecha, pasa a
  `AWAITING_FIRST_PAYMENT`; el toggle pide confirmación avisando que la landing se despublica.
- **Mail del pagador editable.** Al generar el link, el admin puede escribir el mail de la cuenta de MP del pagador
  (por defecto, el del dueño). Se guarda en `payerEmail` y es el que se muestra en el aviso. Cambiarlo implica
  regenerar el link.
- **"Pagar con Mercado Pago" en `BLOCKED`** no abre un flujo de pago nuevo (sería el approach 2 descartado):
  - si la suscripción está `authorized` (la tarjeta falla), el texto guía a cambiar el medio de pago desde su cuenta
    de MP, y se muestra la transferencia;
  - si está `cancelled`, solo se muestra transferencia + WhatsApp, y el admin decide si regenera el link;
  - si está `pending`, el botón abre el `init_point`.
- **Suspensión manual no toca MP.** La ficha muestra una advertencia "la suscripción sigue cobrando". **Desactivar el
  cobro cancela el preapproval** en MP. Si la llamada a MP falla, no se aplica el cambio y se muestra el error.
- **`planExpiresAt` deja de ser editable a mano** en barberías con cobro activado: solo cambia con pagos. El pago
  manual es la vía para corregirlo. `plan` (FREE/BASIC/PRO) sigue siendo informativo. El `planBanner` actual queda
  para `EXEMPT`; con cobro activado lo reemplaza el banner de `GRACE`.
- **Llave de idempotencia:** el id del pago subyacente de MP, para que el mismo cobro no cuente dos veces si llega por
  los tópicos `payment` y `subscription_authorized_payment`. Reembolsos y contracargos se ignoran. Si alguien paga
  tarde, se le acreditan desde la fecha de pago (algunos días de regalo; aceptado).

## Qué queda para el builder

Ubicación exacta de los campos (Barbershop vs. modelo aparte), nombres, cómo cablear el estado derivado en
`requireSession`/layout, el diseño visual de las pantallas (siguiendo shadcn/Tailwind del proyecto), cliente HTTP
de MP (fetch directo o SDK oficial), y el orden de los jobs de la factory. Tests de: cálculo del estado de cobro
(bordes de fechas y timezone), extensión del período, idempotencia del webhook, y que `BLOCKED` no corte la
reserva pública.
