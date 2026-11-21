VERDICT: PASS

## Hallazgos
- [nit] `src/server/actions/services.ts:186` (`applyBulkPriceUpdate`): el lote acepta hasta 500 ids y en modo `all` recorre todos los servicios activos con un `updateMany` por fila dentro de la transacción. No es un problema de aislamiento, pero con catálogos grandes la transacción interactiva puede pasar el timeout por defecto de Prisma (5 s) → si se vuelve un problema, pasar `{ timeout }` a `$transaction` o agrupar por precio resultante.
- [nit] `src/server/actions/services.ts:122,135,186`: el `safeParse` corre antes de `requireRole`, así que alguien sin sesión puede ver mensajes de validación (no revela datos, y es el orden que pide el agente/patrón del repo). Sin cambio necesario.
- [nit] `src/lib/pricing.ts:15`: `PRICE_PATTERN` (`\d{1,10}`) + `MAX_PRICE_CENTS` coinciden con `Decimal(12,2)`; `exceedsMaxPrice` frena desbordes en el bulk antes de escribir. OK, solo se deja constancia.

Verificado sin observaciones:
- IDOR: `getService` usa `findFirst({ where: { id, barbershopId } })`; la página `services/[id]` hace `requireRole("OWNER")` y pasa `session.barbershopId` → id ajeno = `notFound()`. `updateService` y `setServiceActive` usan `updateMany({ where: { id, barbershopId: session.barbershopId } })` y devuelven error si `count === 0`.
- OWNER-only: `createService`, `updateService`, `setServiceActive`, `applyBulkPriceUpdate` llaman `requireRole("OWNER")` (rol re-leído de la DB en `getSession`). El listado usa `requireSession` y oculta controles a BARBER; las actions igual rechazan.
- Bulk: `findMany` filtrado por `barbershopId` de la sesión + `active: true`; con `scope=selected` rechaza el lote entero si algún id es ajeno/inactivo/inexistente (comparación de longitud tras deduplicar); precios recalculados desde la DB, nunca del cliente; escritura en una sola `$transaction` con `barbershopId` también en cada `updateMany`.
- Zod: nombre 1–80, descripción ≤500, precio string regex ≤2 decimales y ≤ máximo de la columna, duración entero 5–480, `sortOrder` 0–9999, id ≤64, porcentaje −100..1000 con ≤4 decimales, monto fijo acotado, enums para modo/redondeo/alcance, `serviceIds` ≤500. `barbershopId` nunca se lee del form.
- Sin `dangerouslySetInnerHTML`, sin secretos ni `NEXT_PUBLIC_*`, errores sin internals (`BulkUpdateError` con mensajes propios; el resto se relanza). `select` explícito en las queries; no se tocan rutas públicas.

## Revisado
Diff completo `main...factory/003-services-and-bulk-pricing` (actions, queries, pricing, páginas y componentes de `/dashboard/services`) contra `src/lib/auth.ts` y el schema.
