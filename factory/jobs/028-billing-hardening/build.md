# Build: 028-billing-hardening
**Rama:** factory/028-billing-hardening · **Commit:** 6edd8b5 · **Worktree:** .worktrees/028-billing-hardening

## Qué cambió
- `src/lib/admin-billing.ts`: `hasLivePreapproval` ahora es un type guard genérico (`shop is T & { mpPreapprovalId: string }`).
- `src/lib/barbershop-settings.ts`: `ActionResult` suma `values?: Record<string, string>` en la rama `ok: false`. Es solo un campo opcional.
- `src/server/actions/admin-billing.ts`:
  - **Generar link:** el guardado es un `updateMany` condicionado a `{ id, mpPreapprovalId leído, billingEnabled: true }`. Si actualiza 0 filas: loguea, ejecuta `cancelPreapproval(created.id)` (si falla, el log lleva `created.id`), revalida y devuelve `ok:false` con "La suscripción cambió mientras guardábamos. Recargá la página y probá de nuevo."
  - **Rollback cuando falla el create:** es un `updateMany` condicionado al `mpPreapprovalId` leído y está dentro de try/catch con `logError`. Siempre devuelve `MP_CREATE_FAILED`.
  - **Desactivar el cobro:** es un `updateMany` condicionado a `{ id, mpPreapprovalId leído, billingEnabled: true }`. Con 0 filas: `logError` y `ok:false` genérico, sin `updateTag`.
  - **`values` en los errores:** `generateSubscriptionLink`, `changeSubscriptionAmount` y `registerManualPayment` devuelven `values` (lo enviado, como string) en todos los `ok:false` posteriores a leer el form.
  - **Se sacaron los `!`.**
  - **Extra:** en `changeSubscriptionAmount`, el `update` final quedó en try/catch para que el error de DB también devuelva `values` en lugar de lanzar.
- `src/server/actions/admin-billing.test.ts`: 10 tests nuevos (carreras, rollback protegido, `values`).
- `src/server/mercadopago-webhook.ts`:
  - `shopByPreapproval` ahora también selecciona `monthlyAmount`.
  - Un pago aprobado con un monto no finito no llama a `recordPayment`: hace `console.error("[mp-webhook] anomalía: pago aprobado con monto no numérico", { paymentId, preapprovalId })` y devuelve `"ignored"`.
  - Si el monto es distinto de `monthlyAmount` (se compara con `Decimal.equals`), hace `log("monto distinto de monthlyAmount", { paymentId, barbershopId, amount, monthlyAmount })` y registra el pago igual.
  - Se actualizó el comentario de cabecera.
- `src/server/mercadopago-webhook.test.ts`: `makeShop` acepta `monthlyAmount`. Hay 5 tests nuevos (NaN e Infinity con `it.each`, monto distinto, monto igual y sin `monthlyAmount`).
- `src/app/admin/(panel)/barbershops/[id]/billing/link-form.tsx`: `defaultValue = state.values.<campo> ?? default` en monto y mail.
- `src/app/admin/(panel)/barbershops/[id]/billing/amount-form.tsx`: lo mismo para el monto.
- `src/app/admin/(panel)/barbershops/[id]/billing/manual-payment-form.tsx`: lo mismo para monto, fecha, meses y nota.
  - El `<select>` de meses lleva `key={sent?.months || "1"}`, porque React no aplica un `defaultValue` nuevo a un `<select>` ya montado y el reset del form lo volvía a "1". Lo detectó la prueba manual.
- `src/app/(dashboard)/copy-value-button.tsx` (nuevo): componente cliente "Copiar".
  - Recibe solo `value` y `label`.
  - Botón `type="button"`, `h-11` y `aria-label="Copiar <dato>"`.
  - Cuando copia muestra "Copiado" con el ícono `Check`. Si falla, muestra un mensaje en `role="status"` con `aria-live="polite"` que pide copiarlo a mano.
- `src/app/(dashboard)/billing-gate.tsx`:
  - Las filas Alias y CBU/CVU llevan `CopyValueButton`; Titular no.
  - Solo la rama OWNER renderiza el botón. La rama del barbero no cambió.
  - Se actualizó el comentario de cabecera: alias y CBU viajan al cliente, solo en la rama OWNER.

Todo dentro del scope (`git diff --name-only main...HEAD` = 11 archivos, todos listados en Target Files). No se tocaron la ruta del webhook, `src/lib/mercadopago.ts`, el schema ni las dependencias.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `admin-billing.test.ts` › "generateSubscriptionLink: carreras (028)", tres casos:<br>• Otra pestaña cambia el `mpPreapprovalId` durante el create: da `ok:false`, el último `cancelPreapproval` es con `fresh.id` y la DB conserva el id de la otra pestaña.<br>• Se desactiva el cobro en paralelo: se cancela el nuevo y queda `mpPreapprovalId` null.<br>• Falla la cancelación compensatoria: el log incluye `fresh.id`.<br>"setBillingEnabled: carrera al desactivar (028)": `ok:false` y `billingEnabled` sigue en `true`.<br>Los tests existentes del camino feliz pasan. |
| AC-2 | ✅ | Test "create falla y el update del rollback también": `vi.spyOn(db.barbershop, "updateMany").mockRejectedValueOnce(...)`. La acción resuelve con el error "Cancelamos la suscripción anterior…" y se llamó a `console.error` con el id del preapproval viejo y el Error. |
| AC-3 | ✅ | `mercadopago-webhook.test.ts` › "monto NaN / Infinity": devuelve `"ignored"`, no se llama a `recordPayment` y `console.error` recibe `"[mp-webhook] anomalía…"` con `{ paymentId, preapprovalId }`. El test "otros errores de recordPayment suben" sigue pasando. |
| AC-4 | ✅ | Tests "monto distinto" (20000.00 contra 15000: registra y hay un único warn con "monto" y el detalle), "monto igual" (sin warn) y "sin monthlyAmount" (sin warn). La comparación es con `Decimal.equals(amount.toFixed(2))`. |
| AC-5 | ✅ | Tests "values en los errores (028)": `"abc"` devuelve `values = { amount: "abc", payerEmail: "Duenio@Example.com" }`. MP fallando en el link y en el monto, `$transaction` rechazado en el pago manual (devuelve `note` y `months`) y fecha futura.<br>Prueba manual en `pnpm dev --port 3001`: ver abajo. |
| AC-6 | ✅ | Prueba manual a 360px: ver abajo. |
| AC-7 | ✅ | Ver Checks. |

**Nota AC-5, test 2:** el spec dice "con MP fallando, `registerManualPayment`…", pero el pago manual no llama a MP. Lo interpreté como "el registro del pago falla" y lo simulé con `vi.spyOn(db, "$transaction").mockRejectedValueOnce(...)`. Así se recorre la rama `PAYMENT_FAILED`, que es la única de error posterior a las validaciones.

### Verificación manual (d) y (e)
**Setup**, sobre la base propia `barber_job_028`, sin token de MP (así `createPreapproval` falla de verdad):
- `pnpm db:seed` y `pnpm admin:create` (admin QA).
- `barberia-demo` con `billingEnabled=true` y `planExpiresAt = now() - 30 días` (BLOCKED).
- `PlatformSettings` con alias `barber.qa.alias`, CBU `0000003100012345678901` y titular `QA SRL`.

**Ejecución:** con `pnpm dev --port 3001`, manejé Chrome headless por CDP con un script en el scratchpad (fuera del repo): completa los campos, envía con `requestSubmit()` y lee los `.value` después de la respuesta.

**(d) Admin en `/admin/barbershops/<id>`**, con los `<details>` abiertos:
| Caso | Error que se mostró | Valores después del error |
|------|---------------------|---------------------------|
| Link con monto `abc` y mail `tipeado@example.com` | "Revisá los campos marcados." + error en Monto | `amount="abc"`, `payerEmail="tipeado@example.com"` ✅ |
| Link con monto `18123.45` y mail `otro.tipeado@example.com` (MP falla) | "No pudimos hablar con Mercado Pago. No se cambió nada, probá de nuevo." | se conservan los dos ✅ |
| Cambiar monto con `12,5` | Error de Zod | `amount="12,5"` ✅ |
| Pago manual con monto `x15000`, meses 3 y nota | Error de Zod | `amount="x15000"`, `months="3"`, `note` conservada ✅ |
| Pago manual con fecha `2099-01-01`, meses 4 y nota | "La fecha de pago no puede ser futura." | `paidAt="2099-01-01"`, `months="4"`, `note` conservada ✅ |

La primera corrida mostró `months` en "1" en los dos casos del pago manual; el fix de `key` en el `<select>` lo resolvió.

**(e) Dueño en `/dashboard` a 360px** (`Emulation.setDeviceMetricsOverride` en 360×800, mobile):
- Hay dos botones: `aria-label` "Copiar alias" y "Copiar CBU/CVU", `type="button"` y 44px de alto. Titular no tiene botón.
- `scrollWidth` = 360, sin scroll horizontal.
- Al tocar "Copiar" en el alias, el texto pasa a "Copiado" con `svg.lucide-check`, y `navigator.clipboard.readText()` (el "pegado") devuelve `barber.qa.alias`. El CBU devuelve `0000003100012345678901`.
- Con `navigator.clipboard.writeText` forzado a rechazar, el status (`aria-live="polite"`) dice "No pudimos copiarlo: seleccioná el alias y copialo a mano."
- En la captura a 360px, el CBU largo hace bajar el botón a la línea siguiente dentro del `<dd>` y no hay desborde.
- **Barbero** (`martin@barberia-demo.test`): ve "Panel no disponible…" y el HTML no contiene "Copiar", ni el alias, ni el CBU.

Apagué el dev server y Chrome al terminar. La base `barber_job_028` quedó con el seed, el admin QA, `barberia-demo` bloqueada y `PlatformSettings` cargado. Es la base propia del job.

## Checks
lint ✅ · typecheck ✅ · test ✅ (30 archivos, 500 tests) · build ✅
