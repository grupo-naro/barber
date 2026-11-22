APPROVE

**Motivo:** 4/4 PASS solo con nits, los 7 AC tienen evidencia y los checks pasan. Diff de 11 archivos, todos dentro del scope, y no toca auth, schema, dependencias, env ni la ruta del webhook.

## Notas
- **Por qué es seguro mergear:**
  - Las escrituras posteriores a MP pasan a ser `updateMany` condicionados al `mpPreapprovalId` leído. Si hay una carrera, se cancela en MP el preapproval recién creado, y si esa cancelación falla, el log lleva `created.id`.
  - El rollback quedó en try/catch.
  - Un monto no finito en el webhook devuelve `"ignored"` con el log `[mp-webhook] anomalía`. La ruta no se tocó y sigue traduciendo eso a 200.
  - El monto distinto se compara con `Decimal.equals` y solo se loguea.
  - `ActionResult` suma solo `values?` en la rama de error.
  - Alias y CBU llegan al cliente solo en la rama OWNER. El barbero no los recibe, y eso se verificó a mano.
- **Fuera del spec, pero menor y coherente:** en `changeSubscriptionAmount`, el `update` final quedó en try/catch para devolver `values`.
- **Seguimientos (nits, no bloquean):**
  - En `setBillingEnabled` (desactivar), el `updateMany` posterior a cancelar en MP no está en try/catch. Ya pasaba antes; habría que agregarle `logError` con el id.
  - Loguear `count === 0` en el rollback del create.
  - `CopyValueButton`: volver a "Copiar" a los ~2 s, que el `aria-label` anuncie "copiado", y que el `<p role="status">` vacío no ocupe altura.
- **Después del deploy:** buscar `[mp-webhook] anomalía` y `monto distinto de monthlyAmount` en los logs de producción.
