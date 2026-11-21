# Cuaderno Digital del día y walk-ins

**Pedido:** "\"Cuaderno Digital\" del día: turnos de hoy, completar turnos agendados y registrar cortes walk-in rápidos con historial y notas del cliente."

## Contexto
- Modelos (`prisma/schema.prisma`, **sin cambios de schema**):
  - `Appointment` (`barberId`, `serviceId`, `customerId`, `startsAt/endsAt` UTC, `status` PENDING|CONFIRMED|COMPLETED|CANCELLED|NO_SHOW).
  - `ServiceRecord` = un corte realizado: `businessDate @db.Date`, `dailyNumber` con `@@unique([barbershopId, businessDate, dailyNumber])`,
    `barberId`, `customerId?`, `appointmentId? @unique`, `paymentMethod` (CASH|TRANSFER|CARD|OTHER), `total Decimal(12,2)`, `notes?`, `cashCloseId?`.
  - `ServiceRecordItem`: `serviceId?`, `serviceName` (snapshot), `priceCharged Decimal(12,2)` (snapshot del `Service.price` vigente).
  - `Customer`: `@@unique([barbershopId, phone])`, `name`, `notes?` (notas técnicas de corte).
  - `CashRegisterClose`: `@@unique([barbershopId, businessDate])` (lo escribe el job 006; acá sólo se lee).
- Auth (`src/lib/auth.ts`): `requireSession()` → `{ userId, barbershopId, role, barbershop.timezone }`. OWNER y BARBER usan el cuaderno.
  El `barbershopId` y el barbero por defecto salen SIEMPRE de la sesión.
- Tiempo: `src/lib/time.ts#businessDate(instant, tz)` da "YYYY-MM-DD" en la timezone de la barbería; `src/lib/slots.ts#zonedTimeToUtc`
  y `addDays` sirven para calcular los límites UTC del día. `@db.Date` se escribe como `new Date("YYYY-MM-DDT00:00:00.000Z")`.
- Dinero: helpers exactos en `src/lib/pricing.ts` (`priceToCents`, `centsToPrice`); nunca `number` flotante para sumar.
- Patrones a copiar: teléfono normalizado a dígitos 8–15 y find-or-create de `Customer` sin carrera (`createMany({ skipDuplicates })` +
  `findUniqueOrThrow`) en `src/server/booking.ts`; actions con Zod `safeParse` → sesión → query con `barbershopId` en
  `src/server/actions/services.ts`; página con `<Suspense>` y `requireSession()` en `src/app/(dashboard)/dashboard/services/page.tsx`.
- UI disponible: `src/components/ui/{button,card,input,label,badge}.tsx`. Usar elementos nativos (`<select>`, `<details>`, radios/chips)
  en lugar de agregar shadcn. La página vive en `/dashboard/today` y se llega por URL (el nav lo agrega otro job).
- Docs de Next 16 a leer: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `08-caching.md`,
  `09-revalidating.md`, `02-guides/forms.md`, `02-guides/server-actions.md`, `02-guides/data-security.md`,
  `02-guides/authentication-with-cache-components.md`. `cacheComponents: true`: sesión/DB dentro de `<Suspense>`; `params`/`searchParams` son asíncronos.

## Criterios de aceptación
- **AC-1 Lógica pura** (`src/lib/records.ts`, sin DB ni Next) con tests en `src/lib/records.test.ts`:
  `dayBoundsUtc("2026-11-20", "America/Argentina/Buenos_Aires")` → `[2026-11-20T03:00:00Z, 2026-11-21T03:00:00Z)`;
  `businessDateToDb("2026-11-20")` → `Date` UTC medianoche; `nextDailyNumber(null) === 1`, `nextDailyNumber(7) === 8`;
  `sumPrices(["100.10","100.10","100.10"]) === "300.30"` (centavos, sin error de float); normalización de teléfono
  (`"+54 9 11 2345-6789"` → `"5491123456789"`, rechaza < 8 o > 15 dígitos); detector `isUniqueViolation(err)` para el código Prisma `P2002`.
- **AC-2 Vista del día** `/dashboard/today` (sin sesión → `/login`): muestra la fecha de negocio de hoy en la timezone de la barbería y
  (a) los turnos cuyo `startsAt` cae en ese día, ordenados por hora, con hora local, cliente, teléfono, servicio, barbero y estado;
  (b) los registros (`ServiceRecord`) de hoy con `#dailyNumber`, hora, barbero, cliente (o "Sin cliente"), servicios, total en ARS y medio
  de pago, más el total del día. OWNER ve todos los barberos; BARBER ve sólo sus turnos y registros. Nunca aparecen datos de otra barbería.
- **AC-3 Completar turno** (action `completeAppointment` en `src/server/actions/records.ts`): sólo turnos de la barbería de la sesión, de hoy y
  en PENDING/CONFIRMED; un BARBER sólo los propios (OWNER cualquiera). Pide medio de pago y servicios (preseleccionado el del turno; se pueden
  sumar otros activos). En **una transacción**: marca el turno COMPLETED con update condicional (`updateMany where status in [PENDING, CONFIRMED]`,
  count ≠ 1 → error), crea `ServiceRecord` (`barberId` = barbero del turno, `customerId`/`appointmentId` del turno, `businessDate` de hoy) e
  items con `serviceName` y `priceCharged` = `Service.price` **leído de la DB en ese momento** (nunca del cliente) y `total` = suma exacta.
  Completar dos veces el mismo turno (incluso en paralelo) deja un solo registro y la segunda llamada devuelve error, sin 500.
- **AC-4 No vino / cancelado** (action `setAppointmentStatus(id, "NO_SHOW" | "CANCELLED")`): mismas reglas de tenant/rol/día; sólo desde
  PENDING/CONFIRMED con update condicional; no crea registro. Un id de otra barbería o de otro barbero (si es BARBER) no modifica nada.
- **AC-5 Walk-in rápido** (action `createWalkIn`): barbero (default = usuario de la sesión; un BARBER no puede elegir otro — el server ignora/rechaza
  otro `barberId`; OWNER puede elegir cualquier usuario **activo** de su barbería), uno o más servicios activos de la barbería (chips/checkbox,
  1 toque cada uno), medio de pago (default CASH) y cliente opcional por teléfono: si existe en la barbería se usa, si no se crea con el nombre
  ingresado (find-or-create sin carrera, sólo dentro de la barbería; nunca pisa `notes`). Sin teléfono → `customerId = null`. Con el
  default de barbero y medio de pago, registrar un corte sin cliente requiere sólo elegir servicio(s) y confirmar.
- **AC-6 Número diario y concurrencia**: `dailyNumber` es 1, 2, 3… por `(barbershopId, businessDate)` compartido por walk-ins y turnos completados.
  La creación calcula `max + 1` dentro de la transacción y ante violación de unicidad (`P2002`) reintenta (≥ 5 intentos) — o usa
  `pg_advisory_xact_lock` por (barbería, día) — de modo que N altas simultáneas producen exactamente 1..N sin huecos ni duplicados y sin
  error al usuario. La lógica de creación vive en `src/server/records.ts` (sin dependencias de Next, como `src/server/booking.ts`) para
  poder verificarlo con un script de `Promise.all` de 10 walk-ins. Si ya existe un `CashRegisterClose` para hoy, completar/registrar se
  rechaza con "La caja de hoy ya está cerrada".
- **AC-7 Historial y notas del cliente**: desde un turno o registro con cliente se abre la ficha (p. ej. `/dashboard/today/customers/[id]`,
  validada contra `barbershopId` de la sesión; id ajeno → 404) con nombre, teléfono, últimos 10 registros (fecha, barbero, servicios, total) y
  las notas técnicas editables (action `updateCustomerNotes`, ≤ 1000 caracteres, vacío → `null`, `where: { id, barbershopId }`). Al cargar un
  teléfono existente en el walk-in se muestran el nombre y las notas del cliente.
- **AC-8 UI y checks**: mobile-first, objetivos táctiles ≥ 44px, tokens de tema, rioplatense, `useActionState`/pending y mensajes de éxito/error;
  tras cada mutación se revalida `/dashboard/today`. Sin dependencias ni componentes shadcn nuevos. `pnpm lint`, `pnpm typecheck`, `pnpm test`
  y `pnpm build` pasan.

## Target Files (Scope)
- `src/app/(dashboard)/dashboard/today/**`
- `src/server/actions/records.ts`
- `src/server/queries/records.ts`
- `src/server/records.ts`
- `src/lib/records.ts`
- `src/lib/records.test.ts`

## Fuera de alcance
- Cierre de caja, liquidaciones y comisiones (`src/app/(dashboard)/dashboard/cash/**`, `src/server/actions/cash.ts`, `src/lib/payouts.ts` — job 006).
- Links de nav: `src/app/(dashboard)/layout.tsx` y `src/app/(dashboard)/dashboard/page.tsx` (job posterior).
- Editar o anular un `ServiceRecord` ya creado, descuentos/propinas/precios manuales, días distintos de hoy, agenda semanal,
  crear turnos desde el panel, ABM de clientes, búsqueda de clientes por nombre.
- Cambios en `src/app/[slug]/**`, `src/server/booking.ts`, `src/lib/slots.ts`, `src/lib/time.ts`, `src/lib/pricing.ts`.
- Schema/migraciones, dependencias nuevas, componentes nuevos en `src/components/ui/`.

## Riesgos
- **Auth/tenants:** toda lectura y mutación filtra por `barbershopId` de la sesión; servicios, barbero, turno y cliente se verifican contra la
  barbería; un BARBER no puede registrar como otro barbero ni tocar turnos ajenos.
- **Dinero:** `priceCharged` y `total` exactos (Decimal/centavos) y tomados de la DB, no del cliente.
- **Concurrencia:** `dailyNumber` único bajo carga (retry en `P2002` o advisory lock); completar turno idempotente (update condicional +
  `appointmentId @unique`).
- **Interacción con 006:** registros creados después de un cierre quedarían fuera de la caja → se bloquean si hay `CashRegisterClose` del día.
- Schema y dependencias: ninguno.
