# Build: 013-hourly-booking-no-barber
**Rama:** factory/013-hourly-booking-no-barber · **Commit:** 92eaa68 · **Worktree:** .worktrees/013-hourly-booking-no-barber

## Qué cambió
- `prisma/schema.prisma`: `Appointment.barberId String?` / `barber User?` (se mantiene `@@index([barberId, startsAt])`).
- `prisma/migrations/20261121015951_appointment_barber_optional/migration.sql`: `DROP NOT NULL` en `Appointment.barberId` + FK regenerada por Prisma (`ON DELETE SET NULL`); no toca otras tablas.
- `prisma/seed.ts`: turnos de la semana en punto, de 1 h, dentro del horario; 0–3 por hora (la 2.ª hora de cada día siempre 2–3); clientes distintos dentro de una hora; futuros abiertos con `barberId: null`, `COMPLETED` con barbero, `NO_SHOW`/`CANCELLED` pasados a veces sin barbero.
- `src/lib/slots.ts`: se reemplazan `computeFreeSlots`/`mergeSlots`/`BLOCKING_STATUSES`/`SLOT_STEP_MINUTES` (y los tipos asociados) por `computeHourlySlots({ hours, date, timeZone?, now })` y `SLOT_MINUTES = 60`. Los helpers de fecha quedan igual.
- `src/lib/slots.test.ts`: tests de `computeHourlySlots`, casos (a)–(e); se mantienen los de `zonedTimeToUtc` y los helpers.
- `src/lib/records.ts`: función pura `resolveCompletingBarber(actor, requestedBarberId)` + `ONLY_OWN_COMPLETION`.
- `src/lib/records.test.ts`: tests de `resolveCompletingBarber`.
- `src/server/queries/booking.ts`: se eliminan `getActiveBarbers`, `loadFreeSlotsByBarber` y `PublicBarber`; nuevo `getDayHours`; `getAvailableSlots(slug, { serviceId, date, now })` usa `computeHourlySlots`.
- `src/server/booking.ts`: Zod sin `barberId` (si llega uno, se descarta); valida el servicio online del tenant, la ventana de días y que `startsAt` esté en `computeHourlySlots`. En la transacción toma `pg_advisory_xact_lock` por `(barbershopId, phone)` y rechaza si ese cliente ya tiene un turno `PENDING|CONFIRMED` a ese `startsAt`. Crea el turno con `barberId: null`, `endsAt = +60 min` y `PENDING`. Devuelve `{ ok, appointmentId, startsAt }`.
- `src/server/actions/booking.ts`: ya no lee `barberId` ni devuelve `barberName`.
- `src/server/records.ts`: en `openAppointmentWhere`, un BARBER ve `barberId = él OR barberId IS NULL`. `completeAppointmentRecord` resuelve el barbero con `resolveCompletingBarber`, verifica que esté activo y sea de la barbería de la sesión (dentro de la transacción) y setea `status: COMPLETED` + `barberId` en el mismo `updateMany` condicional. El `ServiceRecord` se crea con ese barbero.
- `src/server/queries/records.ts`: `TodayAppointment.barber` pasa a ser nullable. En `listTodayAppointments`, BARBER ve los suyos y los sin asignar, ordenados por `startsAt, createdAt, id`. `listTodayRecords` no cambia.
- `src/server/actions/records.ts`: `completeSchema` suma `barberId` (`""` | id).
- `src/app/[slug]/booking-section.tsx`: se saca el paso "¿Con quién?" y `?barber=` ya no se lee. Quedan 3 pasos: servicio → día → horario.
- `src/app/[slug]/booking-form.tsx`: sin `barberId` oculto ni "Barbero"; la confirmación dice "El barbero se asigna en la barbería…".
- `src/app/[slug]/format.ts`: `Selection`/`bookingHref` sin `barber`.
- `src/app/(dashboard)/dashboard/today/page.tsx`: cada turno muestra el barbero o "Sin asignar" (OWNER y BARBER) y le pasa al formulario de completar `barbers` (sólo OWNER), `assignedBarberId` y `currentUserId`.
- `src/app/(dashboard)/dashboard/today/appointment-actions.tsx`: el OWNER ve el selector "¿Quién atendió?". Por defecto queda el barbero asignado si sigue activo; si no, él mismo, marcado "(vos)". El BARBER no ve selector.
- `src/app/(dashboard)/dashboard/today/fields.tsx`: nuevo `BarberSelect` (select nativo `name="barberId"`). El walk-in no se tocó.
- `scripts/booking-smoke.ts`: smoke reescrito para el modelo por hora (AC-3) y la asignación al completar (AC-5). `wipe` borra `ServiceRecord` (y cierres) antes que turnos y clientes.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `migrate dev --name appointment-barber-optional` generó `ALTER COLUMN "barberId" DROP NOT NULL` + DROP/ADD de la FK. Lo probé en una DB descartable (`barber_job_013_ac1`, ya borrada): apliqué `init`, inserté un turno con `barberId='u1'` y después la migración nueva. El turno siguió con `u1` y la columna quedó `is_nullable=YES`. `pnpm exec prisma db seed` → "Seed OK … turnos=73". |
| AC-2 | ✅ | `src/lib/slots.test.ts`: (a) cerrado / null / undefined / sin horas / 12–12 / 14–10 / fecha inválida → `[]`; (b) 10–20 → 10 slots, el primero `2026-03-10T13:00:00.000Z`, el último 19:00; (c) 09:30–12:00 → 10:00, 11:00; 09:00–09:45 → `[]`; (d) now 10:58 → empieza 11:00; now 11:00 → empieza 12:00; (e) la función no recibe turnos ni duración (pasarle extras no cambia la salida). Los tests de `computeFreeSlots`/`mergeSlots` se eliminaron. |
| AC-3 | ✅ | `pnpm exec tsx scripts/booking-smoke.ts` → `OK`, exit 0, corrido 2 veces (es idempotente). Cubre: (a) 10:00 del próximo día hábil con Corte 30 / Barba 20 / Corte y barba 45 → `barberId null`, 60 min, PENDING, sin `barberName`; (b) 3 reservas concurrentes a la misma hora → las 3 ok, +3 turnos; (c) mismo teléfono en otro formato a la misma hora → `ok:false`; doble envío concurrente → 1 ok; a otra hora → ok y mismo Customer; las notas del fixture no se pisan; (d) 10:30, 10:15, 19:00, 08:00, domingo, hora pasada, día pasado, +30 días, servicio de otro tenant, `showOnline=false`, teléfono y nombre inválidos, fecha no ISO, servicio vía otro slug → todos `ok:false`, sin turnos ni clientes nuevos; (e) `barberId` de otro tenant / inexistente / propio → el turno queda `null`. |
| AC-4 | ✅ | `pnpm dev --port 3001` + curl: `/smoke-004` y `?service=…&barber=<Bruno>&date=2026-11-21` → 0 apariciones de "Con quién", Ana, Bruno, Diego o "Cualquiera"; horas `09:00 … 18:00` (10 horas en punto, incluida 10:00, que ya tenía turnos). Domingo 2026-11-22 → "estamos cerrados". Hoy (23 h local) → "No quedan horarios para ese día", sin horas pasadas. El form no tiene `barberId` (sólo slug/serviceId/startsAt/name/phone). Mandé el form de verdad (POST multipart con los `$ACTION_*`) y la confirmación mostró servicio Corte, precio $ 12.000,00, sábado 21 de noviembre, 10:00 hs y "El barbero se asigna en la barbería…", sin nombres de barberos. |
| AC-5 | ✅ | `src/lib/records.test.ts`: los 4 casos de `resolveCompletingBarber`. En el smoke (turnos de hoy creados por DB, `now` = hoy 12:00): BARBER completa uno sin asignar → turno y registro con él; BARBER con el id de otro → `ok:false` y sigue PENDING sin registro; OWNER elige a Diego → los dos con Diego; OWNER sin elegir → él mismo; OWNER con barbero inactivo / de otra barbería / inexistente → `ok:false` sin registro; turno ya asignado a Bruno → sigue con Bruno; BARBER no completa ni cancela uno de otro barbero, pero sí cancela uno sin asignar; un OWNER de otro tenant no puede completar. |
| AC-6 | ✅ | Dev server + login real por form (seed demo + 4 turnos de hoy insertados a mano en mi DB). OWNER: lista ordenada por hora; a las 22:00 aparecen Santiago (reservado antes) → Juan → Mateo (Lucas). Los sin barbero dicen "Sin asignar" y cada turno abierto tiene "¿Quién atendió?" con los 4 activos: por defecto "Carlos Benítez (vos)", y en el turno de Lucas, Lucas. BARBER (martin): ve los suyos y los "Sin asignar", no los de Lucas ni Nicolás, y no tiene selector. Por POST del form, el OWNER completó uno eligiendo a Martín y Martín completó otro sin asignar: los dos quedaron "Completado · Martín Gómez" y aparecen en "Cortes de hoy" como "#1/#2 · Martín Gómez · con turno". Martín forzando `barberId=Lucas` fue rechazado (el turno sigue PENDING). `/dashboard/cash` como OWNER carga ("Caja abierta…"). `pnpm exec tsx scripts/cash-smoke.ts` → OK, exit 0. El walk-in no se modificó. |
| AC-7 | ✅ | SQL sobre `barberia-demo` después del seed: 73 turnos, 0 fuera de la hora en punto, 0 que no duren 1 h, 0 fuera del horario del día (convirtiendo `timestamp` UTC → BA), máximo 3 por hora, 20 horas con 2–3 turnos, 0 futuros abiertos con barbero, 0 `COMPLETED` sin barbero. |
| AC-8 | ✅ | Ver Checks. |

## Checks
lint ✅ · typecheck ✅ · test ✅ (11 archivos, 122 tests) · build ✅

## Notas
- Las reservas que el endpoint público rechaza antes de la transacción (hora no ofrecida, fuera de ventana, servicio ajeno) no crean nada. El lock por teléfono sólo protege contra el doble envío; no hay cupo por hora, como pide el spec.
- Durante AC-6 inserté en `barber_job_013` 4 turnos `ac6-*` de hoy en `barberia-demo`. Se borran con el próximo `prisma db seed`.
