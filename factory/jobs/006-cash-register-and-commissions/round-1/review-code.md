VERDICT: CHANGES

## Hallazgos
- [blocking] `src/server/queries/cash.ts` (`closeCashDay`, rama `records.length === 0` y `count !== ids.length`) y `scripts/cash-smoke.ts:296-299`: con cierres simultáneos del mismo día el perdedor puede leer los registros DESPUÉS de que el ganador committeó (READ COMMITTED), ver 0 registros abiertos y devolver "No hay cortes para cerrar ese día" (o "Los cortes cambiaron…") en vez de "Ya se cerró la caja de ese día". El chequeo `existing` va antes y no lo cubre. Reproducido: el smoke falló 1 de 4 corridas ("los demás devuelven «Ya se cerró…»", exit ≠ 0), lo que además deja AC-5/AC-6 con verificación flaky. La integridad de datos sí está bien (un solo cierre, vincula exactamente el set sumado). → Fix: cuando `records.length === 0` o `count !== ids.length`, volver a consultar `cashRegisterClose` (findUnique) y, si existe, devolver `alreadyClosed`; o tomar un lock al inicio de la transacción (p. ej. `SELECT ... FOR UPDATE`/advisory lock por `barbershopId`+fecha) antes de leer los registros. Corregir también el assert del smoke si se acepta otro mensaje.
- [nit] `src/lib/payouts.ts` (`barberById.get(barberId)!`): `!` evitable; guardar el barbero en el mapa `gross` o lanzar si es undefined.
- [nit] `src/server/queries/cash.ts` `getCashDay` (día cerrado): `openAfterClose` es una query extra; aceptable.

## Revisado
lint ✅ · typecheck ✅ · test ✅ · build ✅ · scope ✅ (7 archivos, todos en Target Files) · AC-1..AC-4, AC-7 ✅ · AC-5/AC-6 ⚠️ (smoke flaky en la carrera concurrente)
Decimal: todo en `bigint` centavos; PERCENTAGE half-up, `barber + shop === gross` por construcción, FIXED_RENT negativo OK, totales = suma exacta de las partes. businessDate vía `src/lib/time.ts` en timezone de la sesión; sin getters locales. El cierre vincula exactamente los ids sumados (`updateMany` por ids + `cashCloseId: null` + `barbershopId`, rollback si count difiere).
