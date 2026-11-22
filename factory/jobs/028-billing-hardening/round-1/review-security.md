VERDICT: PASS

## Hallazgos
- [nit] `src/server/actions/admin-billing.ts:266` (`setBillingEnabled`, desactivar): el `updateMany` condicionado que se escribe después de cancelar en MP no está en try/catch. Si la DB falla, el preapproval queda cancelado en MP, la fila local sigue `billingEnabled: true` con el `mpStatus` viejo y la acción lanza (500 genérico, sin `logError` con el id). Ya pasaba antes con el `update` (no es una regresión) → envolverlo en try/catch con `logError` que incluya `shop.mpPreapprovalId` y devolver `ok:false` genérico, igual que en el rollback de `generateSubscriptionLink`.
- [nit] `src/server/actions/admin-billing.ts:119` (rollback cuando falla el create): si el `updateMany` condicionado actualiza 0 filas (otra pestaña cambió la fila), no se loguea nada. No es un riesgo, porque la fila ya apunta a otro preapproval, pero un `log` con el `count` ayudaría a reconstruir la secuencia en un incidente de cobro.

Sin hallazgos bloqueantes:
- Las cuatro acciones tocadas mantienen el orden `safeParse` → `getAdminSession()` → query/MP. El nuevo `values` solo devuelve al admin lo que él mismo envió; React lo escapa y no expone datos de la DB ni internals.
- Las cuatro acciones del cobro son de admin de plataforma, así que el `findUnique` por id sin `barbershopId` es lo esperado.
- Las escrituras condicionadas (`updateMany` con `id` + `mpPreapprovalId` leído + `billingEnabled: true`) cierran la carrera, y la cancelación compensatoria loguea `created.id` si falla.
- Mensajes a la UI genéricos; el detalle va a `console.error`.
- Webhook:
  - Un monto no finito ahora devuelve `"ignored"` con log `[mp-webhook] anomalía`; ya no queda en loop de 500.
  - `monthlyAmount` se compara con `Decimal.equals` y los logs no llevan PII (solo ids y montos, en server).
  - La ruta y la verificación de firma no se tocaron.
- `CopyValueButton` recibe solo `value`/`label` y se renderiza solo en la rama OWNER (el barbero retorna antes de `getPlatformSettings`). Sin `dangerouslySetInnerHTML` ni secretos `NEXT_PUBLIC_*`.

## Revisado
Diff completo de main...HEAD (11 archivos): admin-billing actions/lib, `ActionResult`, mercadopago-webhook, los 3 forms del admin, billing-gate y copy-value-button, más spec y build.
