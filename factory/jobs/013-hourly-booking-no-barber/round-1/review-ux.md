VERDICT: PASS

## Hallazgos
- [nit] `src/app/[slug]/booking-form.tsx` (confirmación): "El barbero se asigna en la barbería: atendemos por orden de llegada, así que te pedimos que vengas unos minutos antes." es claro y no suena a rechazo. Opcional: aclarar que el horario es orientativo (ej. "el horario es orientativo; atendemos por orden de llegada") para que nadie espere puntualidad exacta.
- [nit] `src/app/(dashboard)/dashboard/today/page.tsx`: "Sin asignar" en gris junto al servicio es suficiente; si el dueño escanea la lista rápido, podría ir con un peso visual levemente distinto. No bloquea.
- [nit] `fields.tsx` `BarberSelect`: usa `nativeControlClass` (mismo control nativo que el resto, ≥ 44px según el build), label asociado por `htmlFor`/`id` y "(vos)" para el dueño. Correcto.

## Revisado
Reserva pública: servicio → día → hora → nombre/teléfono → confirmar = 5 toques (antes 6 con "¿Con quién?"); grilla de horas en 4 columnas a 360px y mensajes de vacío/cerrado claros. /today: el OWNER completa con "¿Quién atendió?" ya con default él mismo "(vos)" (o el asignado), 0 toques extra si es él; el BARBER no ve selector, flujo igual de toques, y ve sus turnos más los "Sin asignar".
