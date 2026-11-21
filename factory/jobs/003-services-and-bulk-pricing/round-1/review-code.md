VERDICT: PASS

## Hallazgos
- [nit] `src/server/actions/services.ts` (`applyBulkPriceUpdate`, scope `all`): el servidor recalcula sobre el conjunto activo actual de la DB, no sobre el set exacto de la vista previa. Si entre la preview y "Confirmar" se crea/reactiva un servicio o cambia un precio, se aplica a algo distinto de lo previsualizado. Es consistente con el AC-5 ("recalcula en el servidor desde los precios de la DB"), pero se puede endurecer mandando los ids (y precios) previsualizados y rechazando si difieren, como ya se hace con scope `selected`.
- [nit] `applyBulkPriceUpdate`: un `updateMany` por servicio dentro de `$transaction` interactiva (query en loop). Aceptable para decenas de servicios (el timeout por defecto es 5 s); si el catálogo creciera, pasar a `$transaction([...])` con un array de updates.
- [nit] `src/app/(dashboard)/dashboard/services/bulk-price-form.tsx`: si cambia el scope a `selected` con 0 elegidos, "Ver vista previa" queda deshabilitado (correcto); sin hallazgos adicionales.

## Revisado
- Dinero: `src/lib/pricing.ts` usa `bigint` en centavos, sin `number` flotante. El porcentaje se escala a 4 decimales, y `divRoundHalfUp` redondea mitades hacia arriba. Redondeo a $500/$1000 exacto sobre centavos. Piso en 0 aplicado antes del redondeo, y -100 % da 0. Tope de columna `Decimal(12,2)` chequeado (`exceedsMaxPrice`) tanto en la UI como en el server. Los tests cubren los casos de AC-1.
- Atomicidad: una sola `db.$transaction`. Lee y escribe dentro de la tx, filtra por `barbershopId` de la sesión y exige `active`. Con scope `selected`, cualquier id ajeno, inexistente o inactivo rechaza todo el lote (`BulkUpdateError` hace rollback). Un `updateMany` con `count !== 1` también hace rollback. Los precios del cliente nunca se usan.
- Auth: todas las mutaciones usan `requireRole("OWNER")` con `where: { id, barbershopId }`. Los BARBER ven la lista sin controles. Zod `safeParse` en todas las actions. Se revalida `/dashboard/services` y `/<slug>`.
- Scope: los 10 archivos están dentro de `## Target Files (Scope)`. Sin cambios de schema ni dependencias.
- Next 16: `Suspense` alrededor del acceso a sesión/DB, `"use client"` sólo en formularios, `server-only` en queries.
- TypeScript: sin `any`, `@ts-ignore` ni `!`.
- lint ✅ · typecheck ✅ · test ✅ · build ✅ · scope ✅ · AC-1..AC-7 ✅
