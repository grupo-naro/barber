# Build: 027-admin-billing
**Rama:** factory/027-admin-billing · **Commit:** b881ec7 · **Worktree:** .worktrees/027-admin-billing

## Qué cambió
- `src/lib/admin-billing.ts`: esquemas Zod de las 6 acciones (monto string decimal >0 con ≤2 decimales, `months` 1–12 default 1, `paidAt` YYYY-MM-DD, CBU 22 dígitos, WhatsApp `[\d\s+-]`), y helpers puros (`hasLivePreapproval`, `isFutureBusinessDate`, `manualPaidAtInstant`, `formatARS`, etiquetas).
- `src/lib/admin-billing.test.ts`: tests de los esquemas y helpers (AC-1).
- `src/server/actions/admin-billing.ts` ("use server"): `generateSubscriptionLink`, `changeSubscriptionAmount`, `setBillingEnabled`, `registerManualPayment`, `markDuplicateReviewed`, `updatePlatformSettings`. Zod → `getAdminSession()` → query. Los errores de MP y de `recordPayment` se loguean con `console.error` y llegan a la UI como mensajes genéricos. `recordPayment` se importa pero no se re-exporta.
- `src/server/actions/admin-billing.test.ts`: tests contra la DB con MP y sesión mockeados (AC-2, AC-3, AC-4).
- `src/server/actions/admin.ts`: `createBarbershop` crea con `billingEnabled: true`, y `updateBarbershop` ignora `planExpiresAt` del lado del servidor cuando `billingEnabled`.
- `src/server/actions/admin.test.ts`: tests de alta y edición contra la DB (AC-5).
- `src/server/queries/admin.ts`: el listado trae `billingEnabled`; el detalle trae los campos de cobro (el monto como string); se agrega `listSubscriptionPayments`.
- `src/app/admin/(panel)/billing-badge.tsx`: badge del estado de cobro.
- `src/app/admin/(panel)/page.tsx`: columna "Cobro" en el listado.
- `src/app/admin/(panel)/layout.tsx`: link "Ajustes" en el header.
- `src/app/admin/(panel)/barbershops/[id]/page.tsx`: carga el historial y monta la sección Suscripción; pasa `billingEnabled` y `mpStatus` a los formularios.
- `src/app/admin/(panel)/barbershops/[id]/edit-form.tsx`: con el cobro activado oculta `planExpiresAt` y muestra un texto aclaratorio en su lugar.
- `src/app/admin/(panel)/barbershops/[id]/status-form.tsx`: aviso "la suscripción sigue cobrando" si `mpStatus = authorized`.
- `src/app/admin/(panel)/barbershops/[id]/billing/subscription-section.tsx`: la tarjeta (estado, MP, pagado hasta, monto en ARS, mail del pagador, link, formularios, toggle e historial).
- `.../billing/copy-link.tsx`: el link de MP con botón de copiar y el aviso del mail.
- `.../billing/link-form.tsx`: Generar o Regenerar link; pide confirmación si hay un preapproval vivo.
- `.../billing/amount-form.tsx`: Cambiar monto.
- `.../billing/billing-toggle-form.tsx`: activar o desactivar el cobro, con confirmación (al activar una barbería que nunca pagó envía `confirm=1`).
- `.../billing/manual-payment-form.tsx`: pago manual (monto, fecha con `max` = hoy, meses 1–12 y nota).
- `.../billing/review-button.tsx`: botón "Marcar revisado".
- `src/app/admin/(panel)/settings/page.tsx` y `settings-form.tsx`: Ajustes de la plataforma (alias, CBU/CVU, titular y WhatsApp).

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `src/lib/admin-billing.test.ts` (52 casos). Monto: acepta `15000` y `15000.5`; rechaza `0`, `-1`, `15000.123`, `abc` y `""`. Meses: 1–12, default 1; rechaza 0, 13 y 1.5. También mail, `paidAt` y CBU. |
| AC-2 | ✅ | `admin-billing.test.ts`, bloque "setBillingEnabled (foco n.º 5)". Si `MpError` → error genérico (se verifica que no incluya el texto, el status ni el id) y la barbería sigue con `billingEnabled=true` y `mpStatus=authorized`. Si MP responde ok → `false` y `cancelled`. Activar sin fecha y sin `confirm` da error y no cambia nada; con `confirm=1` activa. |
| AC-3 | ✅ | Bloque "generateSubscriptionLink": el `invocationCallOrder` muestra cancel antes que create, y se guardan los 5 campos nuevos. Si cancel lanza, create no se llama y la fila queda idéntica (`toEqual(before)`). Si create falla después de cancelar → `mpStatus=cancelled`. `changeSubscriptionAmount` con MP que lanza deja el monto en 15000. |
| AC-4 | ✅ | Pago manual sobre AWAITING → `source=MANUAL`, `createdByAdminId` de la sesión, coversUntil a 3 meses, estado `PAID` y ningún mock de MP llamado. Con `paidAt` de mañana o con `billingEnabled=false` → error y 0 pagos. `markDuplicateReviewed` con un pago de otra barbería no lo toca. Sin sesión, las 6 acciones dan `ok:false`; la fila, los pagos, los settings y los mocks quedan intactos. |
| AC-5 | ✅ | `src/server/actions/admin.test.ts`: el alta queda con `billingEnabled=true` y estado AWAITING_FIRST_PAYMENT. Con el cobro activado, `updateBarbershop` ignora tanto una fecha nueva como el vacío; con el cobro desactivado guarda la fecha. |
| AC-6 | ✅ | Probado a mano con `pnpm dev --port 3001`, cookie de admin firmada con `signAdminSession` y 3 barberías de QA (ya borradas). Ver "Verificación manual". |
| AC-7 | ✅ | `/admin/settings` sin sesión → 307 a `/admin/login`. Con sesión, guarda (`Ajustes guardados.`; el alias se guarda recortado) y rechaza un CBU de 3 dígitos. El dashboard del dueño de una barbería AWAITING muestra el alias, el CBU, el titular y el link `wa.me` guardados. |
| AC-8 | ✅ | Ver Checks. |

### Verificación manual (dev server en el puerto 3001)
Las acciones se dispararon con un POST multipart al estilo de un form (los `$ACTION_*` salen del HTML).
- **Listado `/admin`**: columna "Cobro" con "Sin cobro", "Esperando primer pago" y "Al día". El header muestra el link "Ajustes".
- **Ficha de una barbería con cobro, MP `authorized` y un pago con posible cobro doble**:
  - se ven el badge "Al día", "Autorizada (cobrando)", "Pagado hasta", "$ 15.000,50", el link de MP con "Copiar" y el aviso del mail del pagador;
  - están "Regenerar link", "Cambiar monto", "Registrar pago manual" y "Desactivar cobro";
  - el historial muestra fecha, origen, monto, "cubre hasta" y nota, y el badge "Posible cobro doble" con "Marcar revisado";
  - aparece el aviso "la suscripción sigue cobrando" en Estado;
  - no hay `input name="planExpiresAt"`.
- **Barbería exenta**: se ve el campo `planExpiresAt`, "Activar cobro" con el aviso "Nunca pagó" y no aparecen los formularios de link ni de pago.
- **Acciones que llaman a MP** (sin `MP_ACCESS_TOKEN`): Generar link, Desactivar cobro y Cambiar monto responden "No pudimos hablar con Mercado Pago. No se cambió nada, probá de nuevo.". El log del server muestra `[admin-billing] ... falló` y la respuesta no incluye `MP_ACCESS_TOKEN`. Después de desactivar, la barbería sigue "Autorizada (cobrando)" con el cobro activado.
- **Pago manual sobre AWAITING**: "Pago registrado. Pagado hasta el 22/01/2027." con 2 meses; la barbería pasa a "Al día" y su landing a 200.
- **Activar el cobro en la exenta sin fecha** (con `confirm=1`): "Cobro activado." y su landing pasa de 200 a 404, porque se invalidó el tag del branding.
- **Marcar revisado**: el badge pasa a "Cobro doble revisado".
- **375 px** (Chrome headless por CDP): en la ficha, `/admin/settings` y `/admin`, `scrollWidth` = 375, sin scroll horizontal; la tabla del listado scrollea dentro de su contenedor, como antes. Revisé las capturas de la ficha y de Ajustes.
- `window.confirm` (regenerar, activar o desactivar) no se probó en un navegador real: está en el `onSubmit` de cada form, igual que en el `status-form` existente.

## Notas / decisiones
- `generateSubscriptionLink` rechaza las barberías con el cobro desactivado ("Primero activá el cobro"). Si no, se podría dejar una suscripción de MP viva en una barbería exenta, cuando desactivar justamente la cancela.
- `changeSubscriptionAmount` guarda también el `mpStatus` que devuelve MP en el PUT.
- `setBillingEnabled(false)` sin preapproval deja `mpStatus` como estaba (null); con un preapproval ya cancelado no llama a MP.
- El pago manual guarda `paidAt` al mediodía local del día elegido (`manualPaidAtInstant`).
- Si MP crea el preapproval pero falla el `update` local, la acción loguea el id nuevo y devuelve un error genérico. No pasó en las pruebas: no hay test de ese camino.
- No toqué nada fuera del scope ni hubo cambios de schema.

## Checks
lint ✅ · typecheck ✅ · test ✅ (30 archivos, 485 tests) · build ✅
