VERDICT: PASS

## Hallazgos
- [nit] `src/app/admin/(panel)/barbershops/[id]/billing/link-form.tsx:36`: React 19 resetea los formularios no controlados después de la action, también cuando falla. Si MP devuelve error, el monto y el mail vuelven al default y se pierde lo que tipeó el admin → devolver los valores en `state.values` y usarlos como `defaultValue` (como ya hace `settings-form.tsx`). Aplica igual a `amount-form.tsx` y `manual-payment-form.tsx`.
- [nit] `src/app/admin/(panel)/barbershops/[id]/billing/review-button.tsx:15`: el botón usa `size="sm"`, que queda por debajo de 44px de alto en mobile → `className="h-11 sm:h-8"`. Pasa igual con `<select>` y `Input` de `h-9`/`h-10` en los formularios. Es un panel de admin que se usa sobre todo en escritorio, así que no bloquea.
- [nit] `src/app/admin/(panel)/barbershops/[id]/billing/billing-toggle-form.tsx:36`: la confirmación usa `window.confirm`. Es funcional y accesible, pero el texto es largo en 360px. Aceptable.
- [nit] `src/app/admin/(panel)/barbershops/[id]/billing/subscription-section.tsx:75`: los `<details>` quedan cerrados salvo "Generar link" y "Registrar pago manual" cuando corresponde. Es razonable: el flujo frecuente, que es el pago manual de una barbería sin pagar, ya llega abierto.

## Revisado
Flujo pago manual: 1 toque para guardar (monto, fecha de hoy y 1 mes ya vienen por default), más 1 toque si la sección está cerrada. Generar link: 1 toque (monto y mail del dueño prellenados). Copiar link: 1 toque. Formularios con labels, `inputMode` correcto (decimal, numeric, tel), botones deshabilitados con pending, errores junto al campo, `aria-live` en los estados, copy en voseo y montos en ARS con `formatARS`. Grids en 1 columna en mobile.
