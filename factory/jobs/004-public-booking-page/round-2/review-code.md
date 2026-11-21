VERDICT: PASS

## Hallazgos
- [nit] `src/server/booking.ts:109`: el `update` del nombre corre fuera de cualquier lock sobre el cliente; dos reservas concurrentes con el mismo teléfono y nombres distintos terminan con el último nombre. Inocuo y acorde al spec.

## Notas de revisión
- Fix de la carrera en `Customer`: `createMany({ skipDuplicates: true })` (`ON CONFLICT DO NOTHING`) no aborta la transacción, seguido de `findUniqueOrThrow` por `barbershopId_phone`; actualiza `name` solo si cambió y nunca toca `notes`. Resuelve el nit de la ronda 1 sin reintentos.
- El smoke agrega el caso con `Promise.all` (mismo teléfono nuevo, Ana y Bruno): ambas reservas salen bien y queda un único `Customer`.
- `override` del smoke tipado como `Partial<PublicBookingInput>` (sin cast). La Server Action ya no devuelve `appointmentId`.

## Revisado
lint ✅ · typecheck ✅ · test ✅ · build ✅ · smoke `booking-smoke.ts` OK ✅ · scope ✅ (12 archivos, todos dentro de Target Files) · AC-1..AC-6 ✅
