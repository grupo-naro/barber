# Página pública de reservas `/[slug]`

**Pedido:** Página pública `/[slug]` con el branding de la barbería, el catálogo de servicios y un motor de reserva online con cálculo real de slots libres.

## Contexto
- Hoy en `main` no hay rutas de tenant: sólo `src/app/page.tsx` (landing), `src/lib/db.ts` (cliente Prisma), `src/lib/time.ts`
  (`businessDate`, `localTime`: UTC → hora local) y los componentes `button`, `card`, `input`, `label`, `badge` de shadcn.
  No existe seed ni auth: el job 001 (seed + login + `src/proxy.ts`) corre en paralelo y **no** está mergeado.
  Esta feature **no depende** de 001: la ruta es pública, no usa sesión ni `proxy.ts`, y genera sus propios datos de prueba.
- Modelos usados (sin cambios de schema): `Barbershop` (resuelto por `slug`; públicos: `name`, `logoUrl`, `description`,
  `address`, `phone`, `whatsapp`, `timezone`), `OpeningHours` (`weekday` 0=domingo, `opensAt`/`closesAt` "HH:mm" locales, `closed`),
  `User` (barberos: `active = true` del tenant; sólo se exponen `id` y `name`), `Service` (`active && showOnline`, orden `sortOrder`),
  `Customer` (upsert por `@@unique([barbershopId, phone])`), `Appointment` (`startsAt`/`endsAt` en UTC).
- Diseño esperado:
  - `src/lib/slots.ts` — motor **puro** (sin Prisma ni Next): recibe horario del día, turnos ocupados del barbero, duración del
    servicio, fecha de negocio "YYYY-MM-DD", timezone, `now` y paso (15 min) y devuelve los inicios libres como instantes UTC.
    Incluye la conversión fecha+hora local → UTC usando `Intl` con la timezone (no hardcodear −03:00). Puede importar de `@/lib/time`.
    Un slot es libre si `[inicio, inicio+duración)` entra completo dentro del horario, no se superpone con ningún turno
    `PENDING`/`CONFIRMED`/`COMPLETED` (los `CANCELLED` y `NO_SHOW` liberan el lugar) y empieza después de `now`.
    Para "cualquier barbero" se devuelve la unión de los slots de todos los barberos activos.
  - `src/server/queries/booking.ts` — lecturas públicas: barbería por slug (sólo campos públicos), servicios online, barberos
    activos, y slots disponibles (carga horario + turnos del día y llama al motor). El `barbershopId` siempre sale del slug
    resuelto en el servidor, nunca de un input del cliente.
  - `src/server/booking.ts` — `createPublicBooking(slug, input)` sin dependencias de Next (para poder llamarla desde un script):
    Zod `safeParse` (nombre 2–80 chars, teléfono normalizado a dígitos 8–15, `serviceId`, `barberId` o `"any"`, `startsAt` ISO),
    verifica que servicio y barbero pertenezcan a la barbería del slug, y dentro de una `db.$transaction` toma un lock por barbero
    (`pg_advisory_xact_lock`), **recalcula los slots con el motor** y rechaza si el horario ya no está libre; si `"any"`, asigna el
    primer barbero libre en orden determinista. Upsert de `Customer` por `(barbershopId, phone)` y crea el `Appointment`
    (`status: PENDING`, `endsAt = startsAt + durationMinutes`). Devuelve `{ ok: true, appointmentId, startsAt, barberName }` o
    `{ ok: false, error }` con mensajes en español.
  - `src/server/actions/booking.ts` — `"use server"`, wrapper fino sobre `createPublicBooking` para el formulario (sin sesión: es público).
  - `src/app/[slug]/` — `page.tsx` (+ componentes locales) mobile-first: header con logo/nombre/descripción/dirección/WhatsApp,
    catálogo con precio en ARS (`Intl.NumberFormat("es-AR", …)` sobre el `Decimal`) y duración, y el flujo de reserva:
    servicio → barbero (o "Cualquiera") → día (hoy + próximos 14 días de negocio) → slot → nombre + teléfono → confirmación.
    Recomendado: la selección vive en `searchParams` (`?service=&barber=&date=`) y los slots se renderizan en el servidor dentro
    de `<Suspense>`; el formulario final llama a la Server Action. Slug inexistente → `notFound()`. `generateMetadata` con el nombre.
  - `scripts/booking-smoke.ts` — fixture + smoke test ejecutable con `pnpm exec tsx scripts/booking-smoke.ts` (carga `.env` con
    `dotenv/config`): borra y recrea de forma idempotente la barbería `smoke-004` (horario lun–sáb 09:00–19:00, domingo cerrado,
    2 barberos activos + 1 inactivo, 3 servicios online + 1 con `showOnline=false`, un turno `CONFIRMED` y uno `CANCELLED` el
    próximo día hábil) y una segunda barbería `smoke-004-other` con su propio servicio; ejecuta las verificaciones de AC-4 e
    imprime `OK` o sale con código ≠ 0. Deja los datos cargados para probar la página a mano. **No** usar `prisma/seed.ts`.
- Docs de Next 16 que tiene que leer el builder (`node_modules/next/dist/docs/01-app/`): `01-getting-started/03-layouts-and-pages.md`
  (params/searchParams asíncronos), `06-fetching-data.md`, `07-mutating-data.md`, `08-caching.md` (`cacheComponents: true`:
  datos por request dentro de `<Suspense>`), `02-guides/forms.md`, `02-guides/server-actions.md`, `02-guides/multi-tenant.md`,
  `02-guides/data-security.md`, `03-api-reference/04-functions/not-found.md`.

## Criterios de aceptación
- **AC-1** Motor de slots (`src/lib/slots.test.ts`, Vitest, sin DB): (a) día cerrado o sin horario → `[]`; (b) horario 09:00–12:00
  con servicio de 30 min y paso de 15 → primer slot 09:00 local (= 12:00Z en Buenos Aires) y último 11:30; (c) un turno 10:00–10:45
  bloquea todo slot que se superponga (10:00 no, 09:45 no con 30 min, 10:45 sí) y un turno `CANCELLED`/`NO_SHOW` no bloquea;
  (d) con `now` a las 10:05 del mismo día no se ofrece nada antes de 10:05; (e) un servicio más largo que el hueco disponible no
  genera slot; (f) con dos barberos, "cualquiera" devuelve la unión ordenada y sin duplicados.
- **AC-2** `GET /smoke-004` (tras correr el script, con `pnpm dev`) responde 200 sin sesión y muestra nombre, descripción, dirección
  y los 3 servicios online con precio formateado en ARS (p. ej. `$ 12.000,00`) y duración; no aparece el servicio con
  `showOnline=false` ni el barbero inactivo. `GET /no-existe-xyz` responde 404.
- **AC-3** En `/smoke-004`, al elegir servicio, barbero y el próximo día hábil, se listan los horarios libres en hora local y **no**
  aparece el horario ocupado por el turno `CONFIRMED` (sí el del `CANCELLED`); el domingo muestra un mensaje de "cerrado/sin turnos".
  Completando nombre y teléfono se confirma la reserva y se ve el resumen (servicio, barbero, día y hora); al recargar, ese horario
  ya no está disponible.
- **AC-4** `pnpm exec tsx scripts/booking-smoke.ts` termina con `OK` y código 0, verificando vía `createPublicBooking`: reserva válida
  crea `Appointment` `PENDING` con `endsAt` correcto; reservar el mismo barbero y horario otra vez → `{ ok: false }`; dos reservas
  concurrentes (`Promise.all`) al mismo slot → exactamente una gana; repetir con el mismo teléfono (con otro formato, p. ej. espacios
  o guiones) reutiliza el mismo `Customer`; un `serviceId` de `smoke-004-other` o un barbero inactivo → `{ ok: false }` sin crear nada;
  un horario fuera del horario de atención o en el pasado → `{ ok: false }`; `barberId: "any"` asigna un barbero libre.
- **AC-5** Ninguna respuesta pública expone campos internos: el HTML/props del cliente no contienen `email`, `passwordHash`,
  `payoutScheme`/`payoutValue` ni datos de otros clientes o turnos (sólo se exponen horarios libres). Verificable con
  `curl -s localhost:<puerto>/smoke-004 | grep -E "passwordHash|payoutValue|@"` sin resultados de esos campos.
- **AC-6** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `src/lib/slots.ts`
- `src/lib/slots.test.ts`
- `src/server/queries/booking.ts`
- `src/server/booking.ts`
- `src/server/actions/booking.ts`
- `src/app/[slug]/**`
- `scripts/booking-smoke.ts`

## Fuera de alcance
- Login, sesión, `src/proxy.ts`, panel interno o seed (`prisma/seed.ts`) — son del job 001.
- Cambios de schema/migraciones (p. ej. disponibilidad por barbero, bloqueos, buffers entre turnos): se usa el horario de la barbería.
- Cancelar/reprogramar turnos desde la web, notificaciones por WhatsApp/email, pagos o señas, captcha/rate limiting.
- Nuevas dependencias o nuevos componentes de shadcn (`src/components/ui/**` es hot file): usar `button`, `card`, `input`, `label`,
  `badge` existentes y elementos nativos con tokens de tema.
- Tocar `src/lib/time.ts`, `src/lib/db.ts`, `src/app/layout.tsx`, `src/app/globals.css` o la landing `src/app/page.tsx`.

## Riesgos
- **Endpoint público sin auth que escribe en la DB:** todo input validado con Zod; `barbershopId` derivado del slug en el servidor;
  `serviceId`/`barberId` verificados contra ese tenant (no filtrar datos ni crear turnos cruzados entre tenants).
- **Doble reserva por concurrencia:** re-chequeo de disponibilidad dentro de la transacción con lock por barbero (AC-4).
- **Timezone:** conversión local ↔ UTC correcta en el borde del día (Buenos Aires UTC−3); cubierta por AC-1.
- **Datos personales:** el upsert de `Customer` por teléfono no debe sobrescribir `notes` ni exponer datos del cliente existente;
  sólo actualiza `name` si cambia.
- **Caché:** con `cacheComponents`, los slots deben ser dinámicos (no cachear disponibilidad); si se cachea branding/catálogo con
  `"use cache"`, invalidar o mantener `cacheLife` corto.
- Dependencias nuevas y cambios de schema: ninguno.
