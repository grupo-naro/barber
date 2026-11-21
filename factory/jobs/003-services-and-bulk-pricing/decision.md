APPROVE

**Motivo:** 4/4 reviews PASS, AC-1..AC-7 con evidencia y checks en verde, diff de 10 archivos dentro del scope sin tocar auth, schema, dependencias ni secretos.

## Notas
- Diff (`main...HEAD`): solo `src/app/(dashboard)/dashboard/services/**`, `src/server/actions/services.ts`, `src/server/queries/services.ts`, `src/lib/pricing.ts` y su test (+1236, 0 borradas). Ningún hot file.
- No hay borrado físico: "eliminar" es `active=false` vía `setServiceActive`. Todas las mutaciones usan `requireRole("OWNER")` y filtran por el `barbershopId` de la sesión.
- La actualización masiva recalcula en el servidor desde la DB dentro de una sola `$transaction` y rechaza todo el lote si hay ids ajenos o inactivos. El dinero se calcula en centavos `bigint`.
- Nits para un job posterior, ninguno bloquea:
  - con scope `all` se aplica al set activo actual, no al de la vista previa;
  - un `updateMany` por fila puede pegar contra el timeout de 5 s con catálogos grandes;
  - mejoras de UX/UI en la vista previa y textos de ayuda.
