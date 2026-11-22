# Endurecer el cobro: carreras del link, monto inválido en el webhook, formularios y copiar alias/CBU

**Pedido:** 028-billing-hardening: Seguimientos de las reviews de 026/027: (a) `generateSubscriptionLink` concurrente (doble click / dos pestañas / carrera con desactivar cobro) puede dejar un preapproval vivo en MP sin referencia local → guardar con `updateMany` condicionado al `mpPreapprovalId` leído y, si actualiza 0 filas, cancelar en MP el recién creado; (b) try/catch + `logError` en el update `mpStatus="cancelled"` cuando falla el create; (c) webhook: `transaction_amount` no numérico → `"ignored"` con log de anomalía en vez de 500 (evita loop de reintentos de MP) y log si el monto difiere de `monthlyAmount`; (d) formularios del admin conservan los valores tras un error (`state.values`); (e) botón "Copiar" para alias/CBU en la pantalla de pago del dueño.

## Contexto
Son nits de las reviews ya mergeadas: `factory/jobs/026-mercadopago-webhook/round-1/review-{security,code}.md`, `factory/jobs/027-admin-billing/round-1/review-{security,code,ux}.md` y `factory/jobs/025-billing-access/round-1/review-ux.md`. El diseño general está en `docs/superpowers/specs/2026-11-21-suscripcion-mercadopago-design.md`.

- **`src/server/actions/admin-billing.ts`**
  - `generateSubscriptionLink` lee `shop` (con `billingSelect`), cancela el preapproval vivo (`hasLivePreapproval`), crea uno nuevo con `createPreapproval` y lo guarda con un `db.barbershop.update({ where: { id } })` incondicional.
  - Si el create falla y ya se canceló el anterior, hace `db.barbershop.update({ mpStatus: "cancelled" })` **sin try/catch**.
  - `setBillingEnabled` (desactivar) tiene la misma carrera: lee el estado, cancela en MP y después escribe sin condición.
  - Los mensajes a la UI son genéricos y el detalle va a `logError`.
- **`src/server/mercadopago-webhook.ts`**
  - `handlePayment` llama a `recordPayment` con `payment.transaction_amount.toFixed(2)`.
  - `getPayment` (`src/lib/mercadopago.ts`) ya normaliza un monto no numérico a `NaN`, así que hoy se genera `"NaN"`, `recordPayment` lanza, la ruta responde 500 y MP reintenta en loop.
  - `shopByPreapproval` solo selecciona `id`. `Barbershop.monthlyAmount` es `Decimal?`.
- **Ruta del webhook** (`src/app/api/webhooks/mercadopago/route.ts`): **no se toca**. Ya está en producción y registrada en MP, y su contrato (401/503/400/200/500) se mantiene. El único cambio de comportamiento es que un monto inválido ahora devuelve `"ignored"`, que la ruta ya traduce a 200.
- **Formularios del admin** (`src/app/admin/(panel)/barbershops/[id]/billing/`: `link-form.tsx`, `amount-form.tsx`, `manual-payment-form.tsx`)
  - Usan `useActionState` con campos no controlados (`AdminField defaultValue=...`). React 19 resetea el form después de la action, también cuando hay error.
  - `settings-form.tsx` ya usa el patrón `state.values`.
  - `ActionResult` (`src/lib/barbershop-settings.ts`) solo admite `values` en la rama `ok: true`. Hay que agregar `values?: Record<string, string>` opcional a la rama `ok: false`. Es un cambio compatible.
- **`src/app/(dashboard)/billing-gate.tsx`**
  - Es Server Component. Muestra las filas Alias / CBU/CVU / Titular en un `<dl>` y no tiene forma de copiar.
  - Ya existe el patrón de copiado en `billing/copy-link.tsx`: `navigator.clipboard.writeText`, estado ok/error y `role="status"` con `aria-live`.
- **Docs de Next 16 que tiene que leer el builder:**
  - `node_modules/next/dist/docs/01-app/` sobre Server Actions / `useActionState` (forms) y sobre Server/Client Components (composición, props serializables).
  - `02-guides/data-security.md`, porque el alias y el CBU van a pasar como props a un componente cliente.

## Criterios de aceptación
- **AC-1 (a) Guardado condicional del link.**
  - **Qué cambia:**
    - `generateSubscriptionLink` guarda el preapproval nuevo con `db.barbershop.updateMany`, condicionado a `id`, al `mpPreapprovalId` leído (puede ser `null`) y a `billingEnabled: true`.
    - Si actualiza 0 filas, cancela en MP el preapproval recién creado (`cancelPreapproval(created.id)`), lo loguea con `logError` (si esa cancelación también falla, el log incluye `created.id`) y devuelve `ok: false` con un mensaje genérico en voseo que pide recargar y probar de nuevo.
    - En `setBillingEnabled` (desactivar), la escritura también es un `updateMany` condicionado al `mpPreapprovalId` leído. Si actualiza 0 filas, devuelve `ok: false` genérico y lo loguea.
  - **Se agrega `hasLivePreapproval` como type guard** (`shop is … & { mpPreapprovalId: string }`) y se sacan los `!` de `admin-billing.ts`.
  - **Tests en `src/server/actions/admin-billing.test.ts`:**
    1. Con un `createPreapproval` mockeado que, mientras se ejecuta, cambia el `mpPreapprovalId` de la fila en la DB (simula otra pestaña), el resultado es `ok: false`, `cancelPreapproval` se llama con el id nuevo y la DB conserva el id de "la otra pestaña".
    2. Lo mismo, pero el mock pone `billingEnabled: false` (simula desactivar en paralelo). El preapproval nuevo se cancela y no queda guardado.
    3. Desactivar con un `cancelPreapproval` mockeado que cambia el `mpPreapprovalId` en la DB devuelve `ok: false` y `billingEnabled` sigue en `true`.
    4. Los tests existentes del camino feliz siguen pasando.
- **AC-2 (b) Update del rollback protegido.**
  - **Qué cambia:** si `createPreapproval` falla después de cancelar el anterior, el `update` a `mpStatus: "cancelled"` queda envuelto en try/catch. Si la DB falla, se loguea con `logError` y la acción **devuelve** `{ ok: false, error: MP_CREATE_FAILED }` sin lanzar.
  - **Test:** con `createPreapproval` rechazado y un `vi.spyOn` sobre el método de `db.barbershop` que se use rechazando una vez, `generateSubscriptionLink` resuelve (no rechaza) con ese error y `console.error` se llamó.
- **AC-3 (c) Monto inválido en el webhook.**
  - **Qué cambia:** en `handlePayment`, si el pago está `approved` y `!Number.isFinite(payment.transaction_amount)`, no se llama a `recordPayment`, se loguea con `console.error("[mp-webhook] anomalía: …", { paymentId, preapprovalId })` y se devuelve `"ignored"`.
  - **Tests en `src/server/mercadopago-webhook.test.ts`:**
    1. Con `transaction_amount: NaN`, el resultado es `"ignored"`, `recordPayment` no se llama y `console.error` se llamó.
    2. Con `Infinity` pasa lo mismo.
    3. El test existente "otros errores de recordPayment suben" sigue pasando (los errores inesperados siguen dando 500).
- **AC-4 (c) Log de monto distinto.**
  - **Qué cambia:**
    - `shopByPreapproval` también selecciona `monthlyAmount`.
    - Si la barbería tiene `monthlyAmount` y el monto del pago (a 2 decimales) es distinto, se emite un `console.warn` vía `log("monto distinto de monthlyAmount", { paymentId, barbershopId, amount, monthlyAmount })`. Se compara como string a 2 decimales o con `Decimal`, nunca con aritmética flotante.
    - El pago **se registra igual** (`recordPayment` se llama).
  - **Tests:**
    1. Con `monthlyAmount` = `"20000.00"` y un pago de 15000, `recordPayment` se llama y `console.warn` se llamó con un mensaje que contiene "monto".
    2. Con `monthlyAmount` = `"15000.00"` y un pago de 15000, no hay warn de monto.
    3. Con `monthlyAmount` null, no hay warn de monto.
- **AC-5 (d) Los formularios conservan lo tipeado.**
  - **Qué cambia:**
    - `generateSubscriptionLink`, `changeSubscriptionAmount` y `registerManualPayment` devuelven en **todas** las respuestas `ok: false` posteriores a leer el form un `values` con lo que se envió como string: `amount`/`payerEmail`, `amount`, y `amount`/`paidAt`/`months`/`note` respectivamente. Esto incluye el error de Zod, la fecha futura y los errores de MP o de DB.
    - `link-form.tsx`, `amount-form.tsx` y `manual-payment-form.tsx` usan `state.values.<campo>` como `defaultValue` cuando existe, y si no el default actual. También aplica al `<select>` de meses.
    - `ActionResult` suma `values?` en la rama de error.
  - **Tests en `admin-billing.test.ts`:**
    1. Con un monto inválido (`"abc"`), `generateSubscriptionLink` devuelve `values.amount === "abc"` y el `payerEmail` enviado.
    2. Con MP fallando, `registerManualPayment` devuelve en `values` el `note` y el `months` enviados.
  - **Verificación manual (documentarla en `build.md`):** en `/admin/barbershops/<id>`, con el mock o sin token de MP, tipear un monto y un mail, enviar, ver el error y comprobar que los campos conservan lo tipeado.
- **AC-6 (e) Botón Copiar en la pantalla de pago.**
  - **Qué cambia:**
    - En la pantalla de pago del dueño (`BillingGate`, rama OWNER), las filas **Alias** y **CBU/CVU** tienen un botón "Copiar" (componente cliente nuevo y chico).
    - El botón es `type="button"` y mide ≥ 44px de alto (`h-11`). Su `aria-label` nombra el dato ("Copiar alias", "Copiar CBU/CVU").
    - Al copiar, el texto pasa a "Copiado" y muestra el ícono `Check`. Si el portapapeles falla, aparece un mensaje en `role="status"` / `aria-live="polite"` que pide copiarlo a mano.
    - Titular no lleva botón.
    - La vista del barbero (no OWNER) no cambia y no recibe ningún dato de pago.
    - Hay que actualizar el comentario de cabecera de `billing-gate.tsx`, que hoy dice que los datos de pago no viajan a componentes cliente: ahora solo viajan alias y CBU, y solo en la rama OWNER.
  - **Verificación manual (documentarla en `build.md`):** con una barbería vencida y `PlatformSettings` cargado, entrar como dueño a `/dashboard` a 360px de ancho, tocar "Copiar" en el alias y pegarlo.
- **AC-7** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `src/server/actions/admin-billing.ts`
- `src/server/actions/admin-billing.test.ts`
- `src/lib/admin-billing.ts`
- `src/lib/barbershop-settings.ts`
- `src/server/mercadopago-webhook.ts`
- `src/server/mercadopago-webhook.test.ts`
- `src/app/admin/(panel)/barbershops/[id]/billing/link-form.tsx`
- `src/app/admin/(panel)/barbershops/[id]/billing/amount-form.tsx`
- `src/app/admin/(panel)/barbershops/[id]/billing/manual-payment-form.tsx`
- `src/app/(dashboard)/billing-gate.tsx`
- `src/app/(dashboard)/copy-value-button.tsx` (nuevo)

## Fuera de alcance
- Cambiar `src/app/api/webhooks/mercadopago/route.ts` o su contrato HTTP. Tampoco la ventana anti-replay por `ts` ni firmar `type`.
- Cambiar `getPayment` / `src/lib/mercadopago.ts`, los supuestos de campos de MP o validar `currency_id` (eso es del 029).
- Rechazar o ajustar pagos cuyo monto difiere de `monthlyAmount`: solo se loguean.
- Locks por fila (`SELECT … FOR UPDATE`) o transacciones largas alrededor de las llamadas a MP.
- Áreas táctiles del resto del admin (`review-button.tsx`, alturas de `Input`/`select`), `window.confirm` del toggle y `role="alert"` de la vista del barbero.
- La carrera de `planExpiresAt` en `updateBarbershop` (`src/server/actions/admin.ts`).
- Schema, migraciones, dependencias nuevas o componentes nuevos de shadcn.

## Riesgos
- **Dinero / MP en producción.** El webhook ya está desplegado: un monto inválido deja de reintentarse y queda solo en el log, así que hay que asegurarse de que el `console.error` sea claro y fácil de buscar (`[mp-webhook] anomalía`). La cancelación compensatoria del preapproval recién creado puede fallar, y en ese caso el log tiene que llevar `created.id` para resolverlo a mano.
- **Datos de pago en el cliente.** Alias y CBU pasan como props a un componente cliente, solo en la rama OWNER. El barbero no los recibe.
- **Tipo compartido.** `ActionResult` en `src/lib/barbershop-settings.ts` lo usan muchos formularios. El cambio tiene que ser solo un campo opcional en la rama de error.
- Sin cambios de schema, sin dependencias nuevas y sin hot files.
