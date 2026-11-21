VERDICT: PASS

## Hallazgos
- [nit] `prisma/migrations/20261121015951_appointment_barber_optional/migration.sql`: solo toca `Appointment` (DROP NOT NULL + FK regenerada con `ON DELETE SET NULL`), coherente con `schema.prisma`. No pude correr `prisma migrate diff` con shadow DB (el comando fue bloqueado por el permiso del entorno); la verificacion fue por lectura del SQL y del schema, y `pnpm build`/smokes corren contra la DB migrada.
- [nit] El seed deja a veces barbero en NO_SHOW/CANCELLED pasados (permitido por el spec).

## Revisado
- lint OK, typecheck OK, test OK, build OK.
- `booking-smoke.ts` termina en OK (incluye completar turno: BARBER/OWNER, inactivo, otro tenant, id inexistente) y `cash-smoke.ts` termina en OK (caja sin cambios).
- Scope: los 20 archivos del diff estan dentro de Target Files.
- `computeHourlySlots`: `ceil(openMin/60)` maneja aperturas con minutos (09:30 -> 10:00), `h*60+60 <= closeMin`, estrictamente `> now` (10:58 ofrece 11:00, 11:00 exacto no), conversion con `zonedTimeToUtc` en la timezone de la barberia, sin getHours locales.
- `completeAppointmentRecord`: valida barbero activo del tenant dentro de la transaccion; un unico `updateMany` condicional setea `status` y `barberId`; el `ServiceRecord` usa el mismo `barber.id`. `resolveCompletingBarber` es pura y tiene test.
- Consumidores de `Appointment.barber` nulo: `TodayAppointment.barber` nullable, `page.tsx` muestra "Sin asignar", `assignedBarberId` null-safe; caja y `customers/[id]` leen `ServiceRecord.barber` (no nulo). Filtro BARBER `own OR null` en agenda y `openAppointmentWhere`.
- Sin codigo muerto: no quedan `computeFreeSlots`, `mergeSlots`, `SLOT_STEP_MINUTES`, `BLOCKING_STATUSES`, `getActiveBarbers`, `loadFreeSlotsByBarber` en src/scripts/prisma.
- `createPublicBooking`: sin barberId, valida servicio/tenant/ventana/slot por hora, lock advisory por (barbershop, telefono), `endsAt = +60 min`, `barberId null`.
- Seed: turnos en punto de 1 h, hora con 2-3 turnos, futuros sin barbero, COMPLETED con barbero.
- AC-1..AC-8 OK (AC-4/AC-6 de UI revisados por codigo, no con servidor).
