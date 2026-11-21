ESCALATE

**Motivo:** Cambio de schema + migración nueva (`Appointment.barberId` nullable, FK `ON DELETE SET NULL`); las 4 reviews PASS y AC-1..AC-8 con evidencia, pero schema/migraciones requieren humano.

## Notas
- Bloqueante de política únicamente: `prisma/schema.prisma` + `prisma/migrations/20261121015951_appointment_barber_optional/migration.sql` (DROP/ADD FK + `DROP NOT NULL`, sólo tabla `Appointment`, sin borrar datos). El orquestador verificó que la DB migrada coincide con el schema (`migrate diff --exit-code` = 0).
- Revisar la FK `ON DELETE SET NULL`: si se borra un User a mano, sus turnos abiertos pasan a "Sin asignar" (hoy la app sólo desactiva usuarios; `ServiceRecord.barberId` sigue obligatorio).
- Toca reglas de rol/dinero: `completeAppointmentRecord` ahora setea el barbero que atendió (define liquidación). Server valida BARBER → sólo él; OWNER → barbero activo del mismo tenant; cubierto por `records.test.ts` y `booking-smoke.ts`.
- Security (nit, no bloqueante, fuera de alcance): la reserva pública ya no tiene cupo; sin rate limit por IP ni tope de turnos abiertos por teléfono se puede llenar la agenda con basura. Conviene un job aparte (máx. turnos abiertos por `(barbershopId, phone)` + rate limit).
- Los BARBER ahora ven teléfono/notas de todos los turnos sin asignar del día (lo pide el spec; exposición mayor que antes).
- Scope: los 20 archivos del diff están dentro de Target Files; sin dependencias nuevas, sin cambios en auth/proxy ni env. Checks: lint/typecheck/test (122)/build OK; booking-smoke y cash-smoke OK.
- Si todo esto está bien: `/factory approve 013-hourly-booking-no-barber`.
