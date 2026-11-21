VERDICT: PASS

## Hallazgos
- [nit] `src/server/booking.ts` (upsert de `Customer`): dos reservas concurrentes con el mismo teléfono nuevo y barberos distintos (locks distintos) pueden chocar en el unique `(barbershopId, phone)` y devolver el error genérico "No pudimos confirmar…" en vez de reintentar. Caso muy raro; se puede capturar P2002 y reintentar el upsert.
- [nit] `scripts/booking-smoke.ts:263`: `override as object` es un cast evitable (tipar `override` como `Partial<PublicBookingInput>`).
- [nit] `src/app/[slug]/format.ts:7`: `price as Intl.StringNumericLiteral` es un cast necesario para formatear el decimal sin pasar por float; aceptable.
- [nit] El 404 en `next start` del primer request a un slug no prerenderizado devuelve 200 (limitación de Cache Components, documentada en build.md); queda como seguimiento en `proxy.ts` (job 001).

## Notas de revisión
- Timezone: `zonedTimeToUtc` usa `Intl` (sin offset fijo), con segunda pasada para DST; límites del día calculados con la timezone de la barbería; `businessDate`/`localTime` de `src/lib/time.ts`; sin getters locales.
- Concurrencia: `$transaction` + `pg_advisory_xact_lock(hashtext(barberId))` en orden determinista (sin deadlocks), re-chequeo con el motor dentro del lock, el slot solicitado debe coincidir exactamente con uno libre (grilla, horario, futuro); smoke con `Promise.all` → gana exactamente una.
- Multi-tenant: `barbershopId` desde el slug; servicio y barberos verificados contra el tenant; solo `id`/`name` de barberos expuestos; upsert de Customer no toca `notes`.
- Precio como string decimal; sin N+1 (una query de turnos para todos los barberos).

## Revisado
lint ✅ · typecheck ✅ · test ✅ (12/12) · build ✅ · smoke `booking-smoke.ts` OK ✅ · scope ✅ (12 archivos, todos dentro de Target Files) · AC-1..AC-6 ✅ (AC-2/3/5 por inspección de código y evidencia de build.md)
