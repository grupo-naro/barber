# Horario cortado: hasta 2 franjas por día

**Pedido:** "Necesito hacer un cambio con el horario: las barberías por ejemplo tienen dos horarios, de 10 a 2 y de 17 a 21."

## Contexto
Hoy `OpeningHours` (`prisma/schema.prisma`) tiene **una fila por día de semana** (`@@unique([barbershopId, weekday])`),
con `opensAt`/`closesAt` `String?` ("HH:mm") y `closed Boolean`. Un día cerrado se guarda como fila `closed: true`
(con horas nulas o viejas). Lo usan:

- `src/lib/slots.ts` → `DayHours` (un rango) y `computeHourlySlots` (job 013: hora en punto `H:00` si `[H, H+1h)` entra
  en el horario y `H:00 > now`; sin cupo). Test: `src/lib/slots.test.ts`.
- `src/server/queries/booking.ts` → `getDayHours` (`findUnique` por `barbershopId_weekday`) y `getAvailableSlots`
  (calcula `open`). `src/server/booking.ts` → `createPublicBooking` valida la hora reservada con `getDayHours` +
  `computeHourlySlots`. (`src/server/actions/booking.ts` solo delega; no toca horarios.)
- `src/lib/barbershop-settings.ts` → `DayHoursData`, `openingHoursSchema` (7 días, un rango), `openingHoursErrors`.
  Test: `src/lib/barbershop-settings.test.ts`.
- `src/server/queries/barbershop.ts` → `getBarbershopSettings` arma `hours: DayHoursData[]`.
- `src/server/actions/barbershop.ts` → `updateOpeningHours` (lee `closed-N`/`opensAt-N`/`closesAt-N`, 7 upserts por
  `barbershopId_weekday` en `$transaction`).
- `src/app/(dashboard)/dashboard/settings/hours-form.tsx` (client) desde `page.tsx`.
- `src/server/queries/landing.ts` → `getPublicOpeningHours`; `src/app/[slug]/landing-format.ts` → `weeklyHours`
  (un `Map` por weekday, formato `"09:00 – 20:00"` / `"Cerrado"`, `isToday`); `src/app/[slug]/hours-section.tsx`.
  Test: `src/app/[slug]/landing-format.test.ts`.
- `src/lib/platform-admin.ts` → `defaultOpeningHours()` (job 018, usado por `src/server/actions/admin.ts` con
  `openingHours: { create: … }`): domingo `closed`, lunes a sábado 10:00–20:00.
- `prisma/seed.ts` (`OPENING_HOURS` indexado por weekday, también lo usa el loop que genera turnos) y
  `scripts/booking-smoke.ts` (fixture `smoke-…` lunes–sábado 09:00–19:00, domingo `{ closed: true }`).

**Modelo de datos elegido (cambio aditivo, sin transformar datos):** `OpeningHours` pasa a ser **una fila por franja**.
Se elimina `@@unique([barbershopId, weekday])` y se agrega `@@unique([barbershopId, weekday, opensAt])` (evita franjas
duplicadas; es más laxa que la anterior, así que toda fila existente la cumple). Las columnas no cambian. Semántica,
única y consistente en todo el código:
- **Franja válida** = fila con `closed = false` y `opensAt`/`closesAt` "HH:mm" con `opensAt < closesAt`.
- Un día está **abierto** si tiene ≥ 1 franja válida; sus franjas se ordenan por `opensAt`. Filas `closed: true`,
  incompletas o inválidas se ignoran al leer (= "Cerrado", como hoy).
- Al **guardar**, un día cerrado se escribe como una sola fila `{ closed: true, opensAt: null, closesAt: null }`
  (mismo formato que hoy usan admin y smoke) y un día abierto como 1–2 filas `closed: false`.

Justificación: la migración es solo `DROP INDEX` + `CREATE UNIQUE INDEX`; las filas actuales (un rango o `closed`)
siguen siendo válidas tal cual, sin pérdida de datos, y `defaultOpeningHours`, el fixture de booking-smoke y el seed
siguen siendo inputs válidos para `create`.

Docs de Next 16 a leer: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` y
`node_modules/next/dist/docs/01-app/02-guides/forms.md` (Server Action del form de horarios).

## Criterios de aceptación
- **AC-1 Schema y migración.** `prisma/schema.prisma` reemplaza `@@unique([barbershopId, weekday])` por
  `@@unique([barbershopId, weekday, opensAt])`; nueva migración en `prisma/migrations/<timestamp>_split_opening_hours/`
  generada con `pnpm exec prisma migrate dev --name split_opening_hours`. Solo cambia índices: no hay `UPDATE`/`DELETE`
  ni cambios de columnas. Ninguna referencia a `barbershopId_weekday` queda en `src/**`, `scripts/**` ni `prisma/seed.ts`
  (verificable con grep).
- **AC-2 Validación pura (Vitest, `src/lib/barbershop-settings.test.ts`).** `openingHoursSchema` acepta 7 días, cada uno
  `{ weekday, closed, ranges: { opensAt, closesAt }[] }`. Día abierto: 1 o 2 franjas, cada una "HH:mm" válido y
  `opensAt < closesAt`; la salida queda ordenada por `opensAt`; franjas que se pisan se rechazan (que se toquen,
  ej. 10:00–14:00 y 14:00–18:00, está permitido); 0 franjas o más de 2 se rechazan. Día cerrado: `ranges` sale `[]`.
  Errores en español, agrupados por día por `openingHoursErrors`. Tests cubren: 10–14 + 17–21 ok; franjas desordenadas
  salen ordenadas; solapadas (10–15 + 14–18) error; 3 franjas error; formato inválido; apertura ≥ cierre.
- **AC-3 Motor de slots (Vitest, `src/lib/slots.test.ts`).** `computeHourlySlots` recibe las franjas del día (lista de
  filas; vacía/`null` = cerrado) y devuelve la unión ordenada y sin duplicados de las horas en punto `H` con
  `H:00 >= opensAt` y `H:00 + 60 min <= closesAt` de alguna franja válida, y `> now`. Tests: 10:00–14:00 + 17:00–21:00
  → `10,11,12,13,17,18,19,20`; mismo día con `now` = 10:58 → arranca en 11:00, con `now` = 15:00 → `17,18,19,20`;
  franjas pasadas desordenadas dan el mismo resultado; filas `closed`/incompletas se ignoran; los casos actuales de
  un solo rango siguen pasando. Sin cambio de cupo.
- **AC-4 Servidor de reservas.** `getDayHours` devuelve todas las filas del weekday (`findMany`, filtrado por
  `barbershopId`); `getAvailableSlots` (`open` = hay ≥ 1 franja válida) y `createPublicBooking` usan el mismo
  `computeHourlySlots`, así que una reserva en una hora del hueco (ej. 15:00 en un día 10–14 + 17–21) devuelve
  `SLOT_UNAVAILABLE`. `scripts/booking-smoke.ts` (`pnpm exec tsx scripts/booking-smoke.ts`) sigue pasando y agrega
  checks de un día cortado en su fixture: los slots son solo los de las dos franjas y reservar a una hora del hueco
  falla. `pnpm exec tsx scripts/cash-smoke.ts` sigue pasando.
- **AC-5 Ajustes → Horarios (`/dashboard/settings`).** Por día: switch abierto/cerrado; abierto muestra una franja
  (desde/hasta) y el botón "Agregar turno tarde" (solo si hay 1 franja) para sumar la segunda; cada segunda franja tiene
  botón para quitarla. Mobile-first, controles ≥ 44px de alto, errores por día. `updateOpeningHours` hace Zod
  `safeParse` → sesión/rol OWNER → en un solo `db.$transaction` borra las filas de horario de **la barbería de la
  sesión** y crea las nuevas (cerrado = 1 fila `closed`, abierto = 1–2 filas). Recargar la página muestra lo guardado,
  incluido un día con dos franjas.
- **AC-6 Landing pública (`/[slug]`, `src/app/[slug]/landing-format.test.ts`).** `weeklyHours` agrupa las filas por
  weekday: un día cortado se muestra `"10:00 – 14:00 · 17:00 – 21:00"` (cada franja con el formato actual, unidas por
  `" · "`, ordenadas), un día de una franja igual que hoy, sin franjas válidas `"Cerrado"`; `isToday` y
  `hasOpeningHours` sin cambios de comportamiento. `getPublicOpeningHours` ordena por `weekday` y `opensAt`.
- **AC-7 Admin y seed.** `defaultOpeningHours()` y su test en `src/lib/platform-admin.test.ts` quedan sin cambios y
  crear una barbería desde el admin sigue generando lunes–sábado 10:00–20:00 y domingo cerrado. En `prisma/seed.ts`,
  `barberia-demo` tiene el martes cortado 10:00–14:00 y 17:00–21:00 (el resto igual), y la generación de turnos del
  seed solo crea turnos dentro de las franjas; `pnpm db:seed` corre sin error.
- **AC-8** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `prisma/seed.ts`
- `src/lib/slots.ts`
- `src/lib/slots.test.ts`
- `src/lib/barbershop-settings.ts`
- `src/lib/barbershop-settings.test.ts`
- `src/server/queries/booking.ts`
- `src/server/booking.ts`
- `src/server/queries/barbershop.ts`
- `src/server/actions/barbershop.ts`
- `src/server/queries/landing.ts`
- `src/app/(dashboard)/dashboard/settings/hours-form.tsx`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/app/[slug]/landing-format.ts`
- `src/app/[slug]/landing-format.test.ts`
- `src/app/[slug]/hours-section.tsx`
- `scripts/booking-smoke.ts`

## Fuera de alcance
- Más de 2 franjas por día, excepciones por fecha (feriados, vacaciones) u horarios por barbero.
- Cambiar la duración de los slots, agregar cupo por hora o tocar la grilla de 60 min.
- Cambiar `defaultOpeningHours`, `src/server/actions/admin.ts` o el panel de admin.
- Renombrar/eliminar columnas de `OpeningHours` o migrar las filas `closed` a "sin filas".
- Nuevas dependencias o componentes de shadcn nuevos (usar los existentes en `src/components/ui/`).
- Rediseñar la landing o el resto de Ajustes.

## Riesgos
- **Cambio de schema + migración** (hot files `prisma/schema.prisma`, `prisma/migrations/**`): corre solo y se escala a
  revisión humana. La migración debe ser solo de índices; verificar contra una DB con datos del seed anterior.
- **Multi-tenant:** `updateOpeningHours` borra y recrea filas; el `deleteMany` tiene que filtrar por el `barbershopId`
  de la sesión, nunca del form. `getDayHours` debe seguir filtrando por `barbershopId`.
- **Validación de reservas:** la UI y `createPublicBooking` deben compartir `computeHourlySlots`; si divergen se pueden
  aceptar turnos en el hueco del mediodía.
- Dinero, auth y dependencias: ninguno.
