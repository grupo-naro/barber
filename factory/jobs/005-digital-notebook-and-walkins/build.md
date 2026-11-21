# Build: 005-digital-notebook-and-walkins
**Rama:** factory/005-digital-notebook-and-walkins · **Commit:** aa0eff6 · **Worktree:** .worktrees/005-digital-notebook-and-walkins

## Qué cambió
- `src/lib/records.ts`: lógica pura: `dayBoundsUtc`, `businessDateToDb`, `nextDailyNumber`, `sumPrices` (centavos), `normalizePhone`, `normalizeNotes`, `isUniqueViolation`, etiquetas de medio de pago y estado.
- `src/lib/records.test.ts`: 13 tests de Vitest para lo anterior.
- `src/server/records.ts`: sin Next. `completeAppointmentRecord`, `createWalkInRecord`, `setTodayAppointmentStatus`. Transacción con `pg_advisory_xact_lock(hashtext('records:<shop>:<día>'))` + `max+1`, reintento ante `P2002` (5 intentos), chequeo de `CashRegisterClose`, precios leídos de la DB, find-or-create de cliente sin carrera (`createMany skipDuplicates` + `findUnique`, nunca pisa nombre ni notas).
- `src/server/actions/records.ts`: Server Actions `completeAppointment`, `setAppointmentStatus(id, status)`, `createWalkIn`, `lookupCustomer(phone)`, `updateCustomerNotes`. Patrón Zod → `requireSession()` → lógica con el tenant y el actor de la sesión; `revalidatePath("/dashboard/today")`.
- `src/server/queries/records.ts`: lecturas (`server-only`): turnos y registros de hoy (un BARBER sólo ve lo propio), servicios activos, barberos activos, caja cerrada, ficha del cliente con los últimos 10 registros.
- `src/app/(dashboard)/dashboard/today/page.tsx`: vista del día con `<Suspense>`: fecha de negocio, walk-in, turnos (completar / no vino / cancelar) y registros con total.
- `src/app/(dashboard)/dashboard/today/walk-in-form.tsx`: form del walk-in (chips de servicio, pago por defecto CASH, barbero sólo para OWNER, cliente opcional con búsqueda por teléfono que muestra nombre y notas).
- `src/app/(dashboard)/dashboard/today/appointment-actions.tsx`: form para completar turno (servicio del turno preseleccionado) y botones "No vino" / "Cancelar turno".
- `src/app/(dashboard)/dashboard/today/fields.tsx`: chips de servicios, selector de medio de pago y mensaje `aria-live`.
- `src/app/(dashboard)/dashboard/today/format.ts`: formato ARS y fechas, clases de controles nativos y chips (≥ 44px, tokens).
- `src/app/(dashboard)/dashboard/today/customers/[id]/page.tsx`: ficha del cliente (404 si es de otra barbería).
- `src/app/(dashboard)/dashboard/today/customers/[id]/notes-form.tsx`: edición de notas técnicas con contador.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `pnpm test`: `src/lib/records.test.ts` cubre 13 casos: límites `2026-11-20T03:00Z`–`2026-11-21T03:00Z`, medianoche UTC, `nextDailyNumber`, `"300.30"`, teléfono 8–15, `P2002` |
| AC-2 | ✅ | curl sin cookie → `307 /login?next=%2Fdashboard%2Ftoday`. OWNER: "Viernes, 20 de noviembre de 2026", 30 turnos con Lucas, Martín y Nico, 16 registros (#1…#16) y total. BARBER (martin): 10 turnos, sólo Martín y sólo sus registros (total propio). Queries con `barbershopId` de la sesión |
| AC-3 | ✅ | Script: dos `completeAppointmentRecord` en paralelo dan 1 ok y 1 error, con un solo registro y el turno COMPLETED. Barbero y cliente salen del turno. Turno de otro día, de otra barbería o ajeno (BARBER) → rechazado. HTTP: owner completa → "registro #18"; repetir → "Ese turno ya no está pendiente…"; martin sobre un turno de Lucas → "No encontramos ese turno…" |
| AC-4 | ✅ | Script: NO_SHOW no crea registro y después no se puede cancelar. BARBER sobre un turno ajeno y OWNER sobre un turno de otra barbería → estado intacto. HTTP con martin sobre un turno de Lucas → error |
| AC-5 | ✅ | HTTP: martin con `barberId` de Lucas → "Sólo podés registrar cortes a tu nombre."; sólo con `serviceIds` → "Corte registrado: #17" (default barbero = sesión y pago = CASH). Script: OWNER registra a nombre de Lucas, pero no a nombre de un usuario de otra barbería. Un servicio de otra barbería se rechaza. Teléfono nuevo sin nombre → pide nombre. Dos altas paralelas con el mismo teléfono nuevo crean un solo cliente, y no se pisan nombre ni notas. Un teléfono que existe sólo en otra barbería no se usa |
| AC-6 | ✅ | Script: 10 `createWalkInRecord` con `Promise.all` → números 1..10. La numeración final 1..16 no tiene huecos (walk-ins y turnos comparten la serie). Con `CashRegisterClose` de hoy, walk-in y completar devuelven "La caja de hoy ya está cerrada." y el turno queda intacto |
| AC-7 | ✅ | `/dashboard/today/customers/<id propio>` → 200 con notas y "Últimos cortes". Con un id de otra barbería se renderiza la página not-found ("This page could not be found") sin datos del cliente; el status HTTP es 200 por el streaming (PPR), igual que `/dashboard/services/[id]`. HTTP `updateCustomerNotes`: id ajeno → "No encontramos el cliente."; 1001 caracteres → error; espacios → "Notas borradas." (`null`). `lookupCustomer("+54 9 11 0000-0001")` → nombre y notas |
| AC-8 | ✅ | `useActionState` + `pending` + `aria-live`. Controles `min-h-11`/`h-11`/`h-12`, sólo tokens de tema, textos en vos, `revalidatePath("/dashboard/today")` tras cada mutación (verificado: el total se actualizó después de las mutaciones por HTTP). Sin dependencias ni componentes shadcn nuevos |

Verificación: el script de humo se corrió desde un archivo temporal no commiteado (`node --env-file=.env --import tsx`), contra `barber_job_005` con el seed demo. Las actions se probaron por HTTP en el puerto 3002 con cookies de sesión firmadas localmente. El dev server ya está apagado.

## Checks
lint ✅ · typecheck ✅ · test ✅ (90/90) · build ✅
