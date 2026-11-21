# Build: 004-public-booking-page
**Rama:** factory/004-public-booking-page · **Commit:** c143bec · **Worktree:** .worktrees/004-public-booking-page

## Qué cambió
- `src/lib/slots.ts`: motor puro de slots: `computeFreeSlots`, `mergeSlots` (unión para "cualquiera"), `zonedTimeToUtc` con `Intl` (sin offset fijo), `weekdayOf`/`addDays`/`bookableDates` (hoy + 14), `isValidDate`/`isValidTime`. `CANCELLED`/`NO_SHOW` no bloquean.
- `src/lib/slots.test.ts`: tests de Vitest para AC-1 (a)–(f), más la conversión de timezone (borde del día y DST en Madrid) y los helpers de fecha.
- `src/server/queries/booking.ts`: lecturas públicas sin Next: `getPublicBarbershop` (sólo campos públicos), `resolveBarbershop` (id solo para uso del servidor), `getOnlineServices` (precio como string decimal), `getActiveBarbers` (sólo `id`/`name`), `loadFreeSlotsByBarber` (horario + turnos que bloquean → motor) y `getAvailableSlots` (`{ open, slots }`).
- `src/server/booking.ts`: `createPublicBooking(slug, input, now?)`: Zod `safeParse` (nombre 2–80, teléfono normalizado a 8–15 dígitos, `barberId`/`"any"`, `startsAt` ISO), servicio (`active && showOnline`) y barbero(s) activos verificados contra el tenant del slug, ventana de hoy + 14 días, y `$transaction` con `pg_advisory_xact_lock(hashtext(barberId))` en orden determinista, re-chequeo con el motor, asignación determinista para `"any"` (nombre, id), upsert de `Customer` que sólo actualiza `name` (nunca `notes`) y `Appointment` `PENDING`. Mensajes de error en español.
- `src/server/actions/booking.ts`: `"use server"`: wrapper fino para `useActionState`; si la reserva sale bien llama a `refresh()` para que el horario deje de figurar como libre.
- `src/app/[slug]/page.tsx`: resuelve el slug con el branding cacheado y llama a `notFound()` antes del streaming; `generateMetadata`; `generateStaticParams` devuelve un placeholder (no toca la DB en el build); `instant = false`; flujo dentro de `<Suspense>`.
- `src/app/[slug]/data.ts`: `getCachedBarbershop` (`"use cache"` + `cacheLife("minutes")`): sólo el branding público, sin ids. La disponibilidad nunca se cachea.
- `src/app/[slug]/shop-header.tsx`: header con logo (o iniciales), nombre, dirección, descripción y botones de WhatsApp (`wa.me`) y teléfono.
- `src/app/[slug]/booking-section.tsx`: flujo en `searchParams` (`?service=&barber=&date=&time=`) renderizado en el servidor: catálogo (precio ARS y duración) → barbero o "Cualquiera" → día (hoy + 14) → slots (en su propio `<Suspense>`, con `connection()`) → formulario. Los params que no son del tenant se ignoran. Si el día está cerrado muestra "estamos cerrados".
- `src/app/[slug]/booking-form.tsx`: Client Component con `useActionState`: nombre y teléfono, errores, y resumen de confirmación (servicio, barbero, día y hora).
- `src/app/[slug]/format.ts`: `formatPrice` (con `Intl.NumberFormat("es-AR", ARS)` sobre el string decimal, sin pasar por float), duración, etiquetas de día y `bookingHref`.
- `scripts/booking-smoke.ts`: fixture idempotente de `smoke-004` (lun–sáb 09–19, domingo cerrado, Ana/Bruno activos y Carlos inactivo con email, hash y payout, 3 servicios online y 1 oculto, un turno `CONFIRMED` a las 10:00 y uno `CANCELLED` a las 11:00 del próximo día hábil, y un cliente con notas) más `smoke-004-other`. Verifica AC-4 e imprime `OK`.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `pnpm test`: los 12 tests pasan; `slots.test.ts` cubre (a) cerrado o sin horario, (b) 09:00 = 12:00Z … 11:30, (c) 10:00/09:45 bloqueados, 10:45 libre, CANCELLED/NO_SHOW no bloquean, (d) now 10:05 → primer slot 10:15, (e) hueco corto, (f) unión ordenada y sin duplicados |
| AC-2 | ✅ | `pnpm dev --port 3002`: `GET /smoke-004` → 200 con nombre, descripción, dirección, `$ 12.000,00` / `$ 18.000,00` / `$ 8.000,00` y 30/45/20 min; 0 apariciones de "Servicio interno oculto" y de "Carlos". `GET /no-existe-xyz` → **404** en dev (siempre). Ver nota sobre `next start` abajo |
| AC-3 | ✅ | `?service=Corte&barber=Ana&date=2026-11-21` (próximo día hábil, sábado): `09:00 09:15 09:30 10:30 10:45 11:00 …`; no aparecen 09:45 ni 10:00 (CONFIRMED) y sí 11:00 (CANCELLED). Domingo 22/11: "estamos cerrados. Elegí otro día." Con "Cualquiera" aparece 10:00 (Bruno libre). Envié el formulario por POST sin JS (progressive enhancement de la Server Action) con "Lucía Gómez" / "11 5555-1234": la respuesta muestra "Tu turno quedó reservado" con Servicio Corte, Barbero Ana, Día sábado 21 de noviembre y Hora 11:00. Al recargar ya no aparecen 10:45, 11:00 ni 11:15, y `&time=11:00` muestra "Ese horario ya no está disponible" |
| AC-4 | ✅ | `pnpm exec tsx scripts/booking-smoke.ts` → 33 checks ✓, `OK`, exit 0, y lo corrí 3 veces (es idempotente). Incluye: PENDING y endsAt correcto; doble reserva y superposición rechazadas; 3 reservas concurrentes con `Promise.all` → gana 1 y se crea 1 sola fila; teléfono "11 2345-6789" reutiliza el Customer; las notas del cliente existente se conservan; serviceId de `smoke-004-other`, barbero cruzado de tenant, barbero inactivo y servicio oculto → ok:false; fuera de horario, domingo, fuera de la grilla, pasado, más de 14 días e input inválido → ok:false sin crear turnos ni clientes; `"any"` asigna a Bruno cuando Ana está ocupada y rechaza si están todos ocupados |
| AC-5 | ✅ | `curl -s localhost:3002/smoke-004 \| grep -E "passwordHash\|payoutValue\|@"`: no aparecen passwordHash ni payoutValue; los únicos `@` son internos del framework (referencias RSC `$@`, `@media` en el CSS y rutas `pkg@version` en dev), ningún email. También probé con la selección completa (servicio, any, día y hora): 0 coincidencias de `email`, `payout*`, `customer`, `appointment`, nombres o teléfonos de clientes, "Carlos", `hash-secreto` y `smoke-004.test`. Los barberos se exponen sólo con `id` y `name`, y los slots sólo como horarios libres |
| AC-6 | ✅ | ver Checks |

## Checks
lint ✅ · typecheck ✅ · test ✅ (12/12) · build ✅ (`/[slug]` ◐ Partial Prerender; el build no consulta la DB)

## Notas para review
- **404 con Cache Components en producción:** en `pnpm dev`, `/no-existe-xyz` responde 404 siempre. En `next start`, el **primer** request a un slug que no se prerenderizó recibe el App Shell con 200 (el body es la UI de not-found con `<meta name="robots" content="noindex">`), y los siguientes responden 404. Es lo que dice la doc de Next 16 (`02-guides/streaming.md` y `loading.md#status-codes`): un 404 en tiempo de request sólo es posible desde Proxy. `src/proxy.ts` está fuera de este scope y es del job 001, así que queda como seguimiento: en Proxy, chequear que el slug exista antes de renderizar.
- El branding cacheado (`cacheLife("minutes")`) no incluye ids: si se vuelve a correr el script, servicios, barberos y slots (que son dinámicos) ya reflejan los ids nuevos.
- `createPublicBooking` también rechaza servicios con `showOnline=false` y días fuera de hoy + 14, para ser coherente con lo que muestra la página.

## Respuesta a la ronda 1
**Commit:** f7d6e09 · lint ✅ · typecheck ✅ · test ✅ (12/12) · build ✅ · smoke `booking-smoke.ts` OK ✅ (35 checks)

- ux [blocking]: los chips de servicio, día y horario medían menos de 44px → agregué `min-h-11` a `choiceClass` (barberos, días y horarios) y pasé el `SlotsSkeleton` a `h-11`. Lo verifiqué en el HTML de dev.
- ux: el formulario quedaba fuera de pantalla → al montarse, el form, la confirmación o el aviso de "no disponible" hacen `scrollIntoView` (con `scroll-mt-4`).
- ux: "Cualquiera" ahora viene preseleccionado cuando no hay `barber` en la URL, así que el paso del día aparece apenas elegís el servicio.
- ux: agregué `enterKeyHint` (`next` en nombre, `send` en teléfono). El error del servidor sigue arriba del botón; los campos tienen validación nativa.
- ux: la grilla queda desactualizada después de confirmar → no coincido en que haga falta cambiar algo: la Server Action ya llama a `refresh()` al terminar bien, así que la página se re-renderiza y el horario sale de la grilla. El formulario conserva su estado y sigue mostrando la confirmación.
- code: carrera en el unique de `Customer` (mismo teléfono nuevo, barberos distintos) → ahora es `createMany({ skipDuplicates: true })` (`ON CONFLICT DO NOTHING`, que no aborta la transacción) + `findUniqueOrThrow`, y actualiza `name` sólo si cambió. Agregué al smoke un caso con `Promise.all` para Ana y Bruno con el mismo teléfono nuevo: las dos reservas salen bien y hay un único `Customer`.
- code: `override as object` en el smoke → ahora está tipado `Partial<PublicBookingInput>`.
- code: el cast `Intl.StringNumericLiteral` y el 404 en `next start` → sin cambios (aceptados / seguimiento en `proxy.ts`, job 001).
- security: el nombre de un cliente existente se actualiza con lo que llega → no coincido por ahora: el spec pide explícitamente "sólo actualiza `name` si cambia". `notes` nunca se toca. Si se prefiere `update: {}`, es un cambio de una línea.
- security: `appointmentId` llegaba al navegador → la Server Action ya no lo devuelve (`BookingFormState` = `{ ok, startsAt, barberName }`). `createPublicBooking` lo sigue devolviendo para el script.
- security: rate limit o captcha, exclusion constraint en DB, `logoUrl` arbitrario y 404 en prod → seguimientos: quedan fuera de alcance según el spec (Proxy, schema o branding). Cualquier otro camino que cree o mueva `Appointment` tiene que tomar el mismo `pg_advisory_xact_lock(hashtext(barberId))`.
- ui: agregué `break-words` al `h1` y a la dirección; un CTA "Reservar turno" (`buttonVariants`, `#reservar`) en el header; WhatsApp y teléfono ahora usan `buttonVariants({ variant: "outline" })` con 44px de alto; la confirmación muestra el precio y la hora con `tabular-nums`. El `<img>` del logo queda como está (aceptado).
