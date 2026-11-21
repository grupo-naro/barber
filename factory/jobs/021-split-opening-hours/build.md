# Build: 021-split-opening-hours
**Rama:** factory/021-split-opening-hours · **Commit:** e3ddbc9 · **Worktree:** .worktrees/021-split-opening-hours

## Qué cambió
- `prisma/schema.prisma`: `OpeningHours` pasa de `@@unique([barbershopId, weekday])` a `@@unique([barbershopId, weekday, opensAt])` (una fila por franja). Columnas sin cambios.
- `prisma/migrations/20261121200000_split_opening_hours/migration.sql`: solo `DROP INDEX "OpeningHours_barbershopId_weekday_key"` + `CREATE UNIQUE INDEX "OpeningHours_barbershopId_weekday_opensAt_key"`. Sin `UPDATE`/`DELETE` ni cambios de columnas.
- `prisma/seed.ts`: `barberia-demo` tiene el martes cortado 10:00–14:00 y 17:00–21:00 (`DEMO_OPENING_HOURS`); `otra-barberia` sigue igual. Los turnos se generan con `bookableHours()`, que une las franjas, así que no hay turnos en el hueco.
- `src/lib/slots.ts`: `DayHours` ahora es una lista de filas (`HoursRow[]`, `null`/`[]` = cerrado). Nuevos `validRanges()` e `isOpenDay()`. `computeHourlySlots` devuelve la unión ordenada y sin duplicados de las horas en punto de cada franja válida, filtrando por `> now`.
- `src/lib/slots.test.ts`: los casos de un solo rango se adaptaron a listas y se agregaron tests de horario cortado (10–14 + 17–21, now 10:58 y 15:00, franjas desordenadas, filas cerradas/incompletas ignoradas, sin duplicados) y de `validRanges`/`isOpenDay`.
- `src/lib/barbershop-settings.ts`: `DayHoursData = { weekday, closed, ranges: TimeRange[] }`, `MAX_RANGES_PER_DAY = 2`. `openingHoursSchema` valida 1–2 franjas, formato "HH:mm", apertura < cierre y que no se pisen (que se toquen sí se permite), y devuelve las franjas ordenadas. Un día cerrado devuelve `ranges: []`.
- `src/lib/barbershop-settings.test.ts`: tests nuevos de franjas (cortado ok, orden, contiguas ok, solapadas, 3 franjas, 0 franjas, apertura ≥ cierre en la 2.ª, formato inválido, errores agrupados por día en español).
- `src/server/queries/booking.ts`: `getDayHours` usa `findMany({ where: { barbershopId, weekday } })` ordenado por `opensAt`. En `getAvailableSlots`, `open = isOpenDay(hours)`.
- `src/server/booking.ts`: sin cambios de lógica; `createPublicBooking` usa la misma `getDayHours` + `computeHourlySlots` que la grilla. Solo cambió el comentario.
- `src/server/queries/barbershop.ts`: `getBarbershopSettings` agrupa las filas por weekday y arma `ranges` ordenadas. Un día sin franjas válidas sale `closed`, con las horas viejas como precarga.
- `src/server/actions/barbershop.ts`: `updateOpeningHours` lee `open-N` y `opensAt-N-i`/`closesAt-N-i` (lee hasta i=2 para que Zod rechace 3 franjas). El orden es `safeParse` → OWNER → `$transaction([deleteMany({ barbershopId: sesión }), createMany(filas)])`. Un día cerrado se guarda como una fila `{closed:true, opensAt:null, closesAt:null}`.
- `src/app/(dashboard)/dashboard/settings/hours-form.tsx`: por día hay un switch Abierto/Cerrado (checkbox nativo `role="switch"`). Si está abierto muestra Abre/Cierra, el botón "Agregar turno tarde" (solo con 1 franja; sugiere 17–21) y un botón X para quitar la 2.ª franja. Todos los controles miden ≥ 44px (`h-11`/`size-11`/`min-h-11`), los errores van por día y es mobile-first.
- `src/app/[slug]/landing-format.ts`: `weeklyHours` filtra por weekday las franjas válidas (ahora también exige apertura < cierre), las ordena y las une con `" · "`.
- `src/app/[slug]/landing-format.test.ts`: tests de día cortado, franja `closed` ignorada, `isToday`/`hasOpeningHours` con varias filas, y un caso apertura ≥ cierre → "Cerrado".
- `src/app/[slug]/hours-section.tsx`: `text-right` en el `<dd>` para que el horario cortado quede alineado si se parte en dos líneas en celular.
- `src/server/queries/landing.ts`: `getPublicOpeningHours` ordena por `[weekday, opensAt]`.
- `scripts/booking-smoke.ts`: el fixture tiene horario cortado 10–14 + 17–21 en el weekday del día hábil siguiente a `day1` (filas creadas desordenadas). Se agregaron 12 checks (slots, now en el hueco, rechazo `SLOT_UNAVAILABLE` a 14/15/16/21/09 sin crear turnos, ok a 13/17/20).

`page.tsx` de ajustes no necesitó cambios.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | El schema y la migración están arriba. La migración tiene solo índices (`migrate diff --from-config-datasource` + `migrate dev` aplicada). `grep -rn barbershopId_weekday src scripts prisma/seed.ts` (sin `src/generated`) no devuelve nada. Cargué el seed **viejo** antes de migrar y después de la migración seguían las 14 filas intactas (demo: dom closed, lun–jue 10–20, vie 10–21, sáb 09–18). |
| AC-2 | ✅ | `src/lib/barbershop-settings.test.ts`: 10–14+17–21 ok, desordenadas salen ordenadas, 10–15+14–18 dan "Las franjas no se pueden superponer", 3 franjas dan "Puede haber como mucho 2 franjas por día", formato inválido y apertura ≥ cierre son error, cerrado da `ranges: []`, `openingHoursErrors` agrupa por día. |
| AC-3 | ✅ | `src/lib/slots.test.ts` (f)–(i): 10,11,12,13,17,18,19,20; now 10:58 arranca en 11:00; now 15:00 da 17–20; franjas desordenadas dan lo mismo; las filas closed/incompletas/inválidas se ignoran. Los casos (a)–(e) de un solo rango siguen pasando. |
| AC-4 | ✅ | `pnpm exec tsx scripts/booking-smoke.ts` da **OK**, incluido "día cortado: sólo las horas de las dos franjas (10:00,…,13:00,17:00,…,20:00)" y "reservar a las 15:00 → SLOT_UNAVAILABLE" sin crear turnos. `pnpm exec tsx scripts/cash-smoke.ts` da **OK**. |
| AC-5 | ✅ | Probado con el dev server en :3001 (login como owner@barberia-demo.test y POST progresivo de la Server Action con curl). `/dashboard/settings` renderiza el martes con `opensAt-2-0=10:00 … opensAt-2-1=17:00 closesAt-2-1=21:00`. El POST con jueves 16–20 + 09–13 (desordenado) y domingo sin `open-0` respondió "Horarios guardados.". Al recargar se ven el jueves `09:00–13:00` / `16:00–20:00` y el domingo cerrado. Un POST con franjas solapadas devuelve "…superponer" y uno con 3 franjas "…como mucho 2 franjas", sin tocar la DB. `/otra-barberia` quedó sin cambios (el `deleteMany` filtra por el `barbershopId` de la sesión). |
| AC-6 | ✅ | `landing-format.test.ts` pasa. Con curl, `/barberia-demo` muestra "Martes 10:00 – 14:00 · 17:00 – 21:00" y "Domingo Cerrado". |
| AC-7 | ✅ | No toqué `platform-admin.ts`, su test ni `actions/admin.ts` (`git diff main...HEAD` vacío en esos archivos; el test sigue pasando). `pnpm db:seed` da OK con horarios=15 y los turnos del martes de la demo caen solo en 10–13 y 17–20 (lo verifiqué con un script temporal que después borré). |
| AC-8 | ✅ | Ver Checks. |

## Checks
lint ✅ · typecheck ✅ · test ✅ (290) · build ✅ · booking-smoke ✅ · cash-smoke ✅

Notas:
- `prisma migrate dev --name …` no corre en este shell no interactivo, porque el cambio de unique dispara un warning que pide confirmación. Generé el SQL con `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` en la carpeta `20261121200000_split_opening_hours/` y lo apliqué con `prisma migrate dev`, que terminó en "in sync". Después corrí `prisma generate`.
- Hay un cambio de comportamiento menor en la landing: una fila con apertura ≥ cierre ahora se muestra "Cerrado" (antes mostraba el rango inválido), para que coincida con la semántica de "franja válida" del spec.
- Al terminar la prueba manual dejé la DB del job con el seed re-cargado (martes cortado).
