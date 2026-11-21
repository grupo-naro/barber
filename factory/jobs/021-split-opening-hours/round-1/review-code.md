VERDICT: PASS

## Hallazgos
- [nit] `src/lib/barbershop-settings.ts` (superRefine del schema de día): usa `range.opensAt!` / `range.closesAt!` y `as TimeRange[]`. Están protegidos por las validaciones previas (`allValid`), así que hoy son seguros. → Más adelante conviene estrechar el tipo con un type guard para no depender de `!`.
- [nit] El unique `(barbershopId, weekday, opensAt)` permite varias filas `closed` con `opensAt` NULL, porque Postgres trata los NULL como distintos. → La action siempre escribe una sola fila `closed` por día, así que no hay riesgo real.

## Notas verificadas
- Migración: DROP del unique viejo + CREATE del nuevo, sin cambios de datos. Los datos existentes (una fila por weekday) cumplen el unique nuevo, así que es segura en producción. Coincide con el schema; el orquestador ya verificó que no hay drift.
- Lectores de OpeningHours: `getDayHours` usa `findMany` + `orderBy`; `getAvailableSlots` y `createPublicBooking` comparten `computeHourlySlots`/`isOpenDay`, así que grilla y validación no pueden divergir. Los demás lectores (settings, landing, `weeklyHours`) manejan N filas por día.
- `src/server/actions/admin.ts` y `src/lib/platform-admin.ts` (fuera de scope, sin tocar) solo crean `defaultOpeningHours()`: una fila por weekday. Siguen siendo correctos con el unique nuevo.
- Motor de slots: se ofrece la hora H:00 si [H:00, H:00+60) entra en alguna franja. Con now=10:58 el primer slot es 11:00 (compara `> now`). Las franjas que se tocan no duplican horas (Set). Zona horaria vía `zonedTimeToUtc`.
- Horas "HH:mm" con ceros a la izquierda y validadas con regex: la comparación de strings es segura.
- Guardado: `$transaction([deleteMany({ where: { barbershopId } }), createMany])`, con `barbershopId` tomado de la sesión. Es atómico y respeta el tenant.
- Tests: cubren superposición (10–15 + 14–18, aunque vengan desordenadas), orden de franjas, tope de 2 (rechaza 3), franjas que se tocan, horario cortado con `now`, y `weeklyHours`.
- Scope: los 17 archivos del diff están dentro de `## Target Files (Scope)`. Sin `any` ni `@ts-ignore`.

## Revisado
lint ✅ · typecheck ✅ · test ✅ · build ✅ · booking-smoke ✅ · cash-smoke ✅ · scope ✅ · AC ✅
