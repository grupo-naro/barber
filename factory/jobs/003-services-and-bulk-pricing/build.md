# Build: 003-services-and-bulk-pricing
**Rama:** factory/003-services-and-bulk-pricing · **Commit:** 10d7d4a · **Worktree:** .worktrees/003-services-and-bulk-pricing

## Qué cambió
- `src/lib/pricing.ts`: lógica pura en centavos `bigint` (sin float): `calculateNewPrice` / `calculateNewPriceCents` (`percent|fixed`, valor con signo, redondeo `none|500|1000` al múltiplo más cercano con mitades hacia arriba, piso en 0), `adjustmentError` (% entre -100 y 1000 con hasta 4 decimales; monto con hasta 2), `isValidPrice`/`normalizePrice`, `priceToCents`/`centsToPrice`, `exceedsMaxPrice` (tope de `Decimal(12,2)`). Usa `BigInt(...)` en lugar de literales `123n` porque el `target` de tsconfig es < ES2020.
- `src/lib/pricing.test.ts`: 14 tests (todos los casos del AC-1 más centavos half-up, Decimal-like, inválidos, tope).
- `src/server/queries/services.ts`: `listServices(barbershopId)` (orden `active desc, sortOrder, name`) y `getService(barbershopId, id)`; precio como string `"12000.00"`.
- `src/server/actions/services.ts`: `createService`, `updateService` (useActionState; Zod con errores por campo en español; `updateMany where {id, barbershopId}` → si `count=0` "No encontramos el servicio"; tras editar redirige a la lista), `setServiceActive(id, active)` (sólo cambia `active`), `applyBulkPriceUpdate` (Zod → OWNER → `db.$transaction` interactiva que relee los precios de la DB filtrando por `barbershopId` y `active`, recalcula con `pricing.ts`, rechaza todo el lote si algún id elegido no es de la barbería / no está activo o si algún precio excede el máximo; devuelve cuántos cambiaron). Todas revalidan `/dashboard/services` y `/<slug>`.
- `src/app/(dashboard)/dashboard/services/page.tsx`: listado dentro de `<Suspense>` (badges "Inactivo" / "Oculto online", precio ARS, duración); para OWNER: alta en `<details>`, botones Editar / Desactivar-Reactivar y la tarjeta "Actualizar precios". BARBER sólo ve la lista.
- `src/app/(dashboard)/dashboard/services/[id]/page.tsx`: edición (OWNER; `requireRole`; id de otra barbería → `notFound()`).
- `src/app/(dashboard)/dashboard/services/service-form.tsx`: formulario cliente de alta/edición (`useActionState`, pending, errores por campo, conserva lo tipeado si hay error; `noValidate` para que mande Zod).
- `src/app/(dashboard)/dashboard/services/active-toggle.tsx`: botón desactivar/reactivar con `useTransition` y error.
- `src/app/(dashboard)/dashboard/services/bulk-price-form.tsx`: tipo (%/monto), dirección (subir/bajar), valor, redondeo (`<select>` nativo), alcance (todos los activos / elegir con checkboxes); paso "Ver vista previa" → lista "actual → nuevo" calculada con `pricing.ts` y "Confirmar y aplicar"; marca y bloquea precios que exceden el máximo; informa el resultado.
- `src/app/(dashboard)/dashboard/services/format.ts`: `formatPrice` (formatea el string, sin float), `formatDuration` y clase de controles nativos ≥ 44px (copia local para no depender de `src/app/[slug]/`).

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `pnpm test` → `pricing.test.ts` 14/14: 12000+10%→13200.00; r500→13000.00; +12.5% r1000→14000.00; 7250+0 r500→7500.00; 3×100.10+10%→110.11 c/u (total 330.33); fijo +1500→13500.00; -1500 sobre 1000→0.00 |
| AC-2 | ✅ | dev :3001 con seed: sin cookie `GET /dashboard/services` → 307 `/login?next=…`; OWNER ve los servicios de barberia-demo (no "Corte clásico" de otra-barberia), Editar/Desactivar/"Actualizar precios"; BARBER ve la lista sin "Editar", "Desactivar", "Nuevo servicio" ni "Actualizar precios"; orden verificado: activos por `sortOrder, name` y el inactivo al final con badge "Inactivo"; servicio con `showOnline=false` muestra "Oculto online" |
| AC-3 | ✅ | `createService` inválido (curl con `Next-Action`) → `fieldErrors` {name: "Ingresá un nombre.", price: "Ingresá un precio válido…", durationMinutes: "La duración mínima es de 5 minutos.", sortOrder: …} y `values` conservados; válido (`8500,5`) → creado con 8500.50; BARBER → `x-action-redirect: /dashboard` sin crear; sin sesión → 307 login. `updateService` con id de barberia-demo desde el OWNER de otra-barberia → "No encontramos el servicio." y nada cambió; update propio → redirect a `/dashboard/services` y `/barberia-demo` muestra el nuevo nombre/precio ($ 4.500,00). `/dashboard/services/<id ajeno>` → not found; BARBER → redirect a `/dashboard` |
| AC-4 | ✅ | `setServiceActive(id,false)` desde otro tenant → "No encontramos el servicio."; args inválidos → "Datos inválidos."; propio → "Servicio desactivado.", desaparece de `/barberia-demo` (0 coincidencias) y sigue en el panel como "Inactivo"; `setServiceActive(id,true)` → vuelve a la web pública |
| AC-5 | ✅ | `applyBulkPriceUpdate`: valor -150 % → error de rango; redondeo "250" → error; selección vacía → "Elegí al menos un servicio."; selección con id de otra barbería, con id inactivo, o desde el OWNER de otra barbería → lote rechazado, ningún precio cambió (verificado en DB); BARBER → redirect. Selección {Corte infantil 12000, Arreglo 9000} +12,5 % r1000 → 14000 / 10000 ("2 servicios"); todos +10 % r500 → 8 actualizados (8500.50→9500, 21000→23000…); fijo -1500 → 7 (el de $0 no cambia). Monto que excede `Decimal(12,2)` → "…No se aplicó ningún cambio." y DB intacta (rollback de la transacción). La UI usa la misma `calculateNewPriceCents` para la vista previa |
| AC-6 | ✅ | Controles con `h-11`/`min-h-11` (44px), chips radio, `<select>`/`<details>`/checkbox nativos, tokens de tema, textos con voseo; `useActionState` (alta/edición/masiva) y `useTransition` (activar) con estados "Guardando…/Aplicando…/Desactivando…" y mensajes `role=status`/`role=alert`. Sin dependencias ni componentes shadcn nuevos |
| AC-7 | ✅ | ver Checks |

## Checks
lint ✅ · typecheck ✅ · test ✅ (41/41) · build ✅

## Notas
- La web pública no cachea servicios, así que no hizo falta tocar `src/app/[slug]/**`; igual las actions hacen `revalidatePath("/<slug>")`.
- Si en la vista previa algún servicio cambió de precio entre la preview y la confirmación, el servidor aplica el ajuste sobre el precio actual de la DB (no confía en el cliente).
- Datos de prueba: se corrió el seed en `barber_job_003` y se crearon/modificaron servicios ahí (sólo esa base).
