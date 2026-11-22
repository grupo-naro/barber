# Build: 025-billing-access
**Rama:** factory/025-billing-access · **Commit:** ae8dfeb · **Worktree:** .worktrees/025-billing-access

## Qué cambió
- `src/lib/auth.ts`: `Session.barbershop` suma `billingEnabled`, `mpStatus`, `mpInitPoint`, `payerEmail` y `billingState` (calculado en `lookupSession` con `new Date()`, después del rechazo por `SUSPENDED`; el cobro no invalida la sesión).
- `src/lib/billing-access.ts` (nuevo): `requirePanelAccess(session)` (redirige a `/dashboard` si `!canUsePanel`), `graceDeadline`, `graceBannerMessage(paidUntil, tz)` y `transferWhatsappUrl(contactWhatsapp, nombre)`. Sin `server-only`, solo `import type { Session }`.
- `src/lib/billing-access.test.ts` (nuevo): test puro (AC-4).
- `src/server/queries/public-barbershop-where.ts` (nuevo): `publicBarbershopWhere` textual del plan.
- `src/server/queries/platform-settings.ts` (nuevo): `getPlatformSettings()` (fila `singleton`, solo lectura).
- `src/server/queries/booking.ts`, `landing.ts`, `slug-exists.ts`: cada `status: "ACTIVE"` pasa a `AND: [publicBarbershopWhere]` (en `findUnique` por `slug` y en el filtro de relación de `getOnlineServices`). `createPublicBooking` (`src/server/booking.ts`) no cambió: resuelve el tenant con `resolveBarbershop`, que ya usa el filtro.
- `src/server/billing-access.test.ts` (nuevo): tests contra la DB (AC-1, AC-2, AC-3).
- `src/server/actions/records.ts`, `services.ts`, `cash.ts`: `requirePanelAccess(session)` justo después de `requireSession()`/`requireRole("OWNER")` en cada action exportada.
- `src/server/actions/barbers.ts`, `barbershop.ts`, `landing.ts`: `requirePanelAccess(session)` dentro del helper `ownerSession()` (lo llaman todas las actions exportadas como primera lectura).
- `src/app/(dashboard)/layout.tsx`: banner del header por estado (`headerBanner`): OWNER en `GRACE` → banner de AC-4 (estilo destructive); `planBanner` solo con `EXEMPT`; `PAID`/bloqueado/BARBER → sin banner.
- `src/app/(dashboard)/dashboard/layout.tsx` (nuevo): envuelve todo `/dashboard/*` en `<Suspense>` + `PanelGate` (children o `BillingGate`).
- `src/app/(dashboard)/billing-gate.tsx` (nuevo): `PanelGate` y `BillingGate` (Server Components). OWNER: título por estado, botón MP (`pending` + `mpInitPoint` https), guía para `authorized`, aviso del `payerEmail`, datos de transferencia cargados, botón de WhatsApp; fallback "Contactá al administrador de la plataforma" si no hay ningún medio. BARBER: solo el aviso, sin leer `PlatformSettings`.
- `src/app/(dashboard)/(account)/dashboard/account/{page,password-form}.tsx`: movidos desde `dashboard/account` a un route group propio (misma URL `/dashboard/account`) para que "Mi cuenta" quede fuera del gate. Solo cambió el import relativo de `form-ui` (ahora con alias `@/app/(dashboard)/dashboard/settings/form-ui`).

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `src/server/billing-access.test.ts` "BLOCKED…": `getPublicBarbershop`, `barbershopSlugExists=true`, landing/horarios/servicios visibles, `createPublicBooking(slug, input, NOW)` → `{ ok: true }` y el `Appointment` existe en la DB. En dev: `/smoke-025` BLOCKED → 200. |
| AC-2 | ✅ | Mismo archivo: `AWAITING_FIRST_PAYMENT` → `getPublicBarbershop`/`getPublicLanding`/`getPublicOpeningHours` `null`, `getOnlineServices` `[]`, `barbershopSlugExists=false`, booking `{ ok: false }` con 0 turnos. `EXEMPT` vencido y `EXEMPT` sin fecha → visibles y reservando. Con las queries de `main` (stash) el test de AWAITING falla (verificado). En dev: `/smoke-025` AWAITING → 404. |
| AC-3 | ✅ | Mismo archivo: `SUSPENDED` + `PAID` → todo oculto, booking rechazado, `login` con contraseña válida devuelve `{ error: SUSPENDED_MESSAGE, email }`, `cookies().set` no se llamó y `lastLoginAt` sigue `null`. |
| AC-4 | ✅ | `src/lib/billing-access.test.ts`: redirige con BLOCKED/AWAITING, no hace nada con EXEMPT/PAID/GRACE; banner con `paidUntil + 12d` y borde de medianoche (23:59:59.999 BA → 27/03 en BA, 28/03 en UTC; +1 ms → 28/03); link `https://wa.me/<dígitos>?text=<encodeURIComponent(...)>` y `null` sin dígitos. |
| AC-5 | ✅ | `grep -c requirePanelAccess` (incluye la línea del import): records 6 (5 actions), services 5 (4), cash 2 (1), barbers/barbershop/landing 2 (1 en `ownerSession`), account 0, auth 0. En dev, `setServiceActive` por POST con `Next-Action`: BLOCKED → `x-action-redirect: /dashboard;push` y el servicio sigue activo; PAID → se desactiva. |
| AC-6 | ✅ | `pnpm dev --port 3001` con barbería `smoke-025` y cookie firmada: AWAITING (OWNER) → "Esperando tu primer pago" + transferencia + WhatsApp; BLOCKED+pending → "Tu suscripción tiene un pago pendiente", "Pagar con Mercado Pago" al `mpInitPoint`, aviso del `payerEmail`; BLOCKED+authorized → guía a "Suscripciones" de MP, sin botón; BLOCKED+cancelled → sin botón ni aviso de MP; sin `PlatformSettings` → sin transferencia/WhatsApp y texto de contacto. BARBER → solo "La barbería tiene un pago pendiente. Hablá con el dueño." (sin alias/CBU/mail/link en el HTML). En todos: header, "Mi cuenta" y "Cerrar sesión" presentes; `/dashboard/account` muestra "Cambiar mi contraseña". |
| AC-7 | ✅ | Dev: GRACE (OWNER) → "No pudimos cobrar tu suscripción. Tenés hasta el 01/12/2026 para regularizarla." y el panel se ve; GRACE (BARBER) → sin banner; PAID → sin banner; EXEMPT vencido → "Tu plan venció…". Tests de `planBanner` sin cambios y en verde. |
| AC-8 | ✅ | Ver Checks. |

## Checks
lint ✅ · typecheck ✅ · test ✅ (23 archivos, 375 tests) · build ✅

## Notas para la review
- **Desvío menor (AC-6):** el aviso "Pagá con la cuenta de Mercado Pago de <payerEmail>" se muestra solo si hay `payerEmail` **y** hay algo que hacer en MP (`pending` con link o `authorized`). Con `cancelled` o sin suscripción quedaba un aviso sin botón que confundía; si se prefiere literal, es quitar la condición en `billing-gate.tsx`.
- **Límite conocido del corte por layout** (documentado en `02-guides/authentication.md` de Next 16, y aceptado por el spec en "Fuera de alcance"): el layout reemplaza la UI, pero el segmento de la página igual se renderiza y viaja en el RSC payload (verificado: el HTML de `/dashboard/today` bloqueado contiene el título "Cuaderno del día" en el payload). Son datos del propio tenant, no de otro; las escrituras sí están cortadas por `requirePanelAccess`. Cortar la lectura requiere guards por página (fuera de alcance).
- Con el panel bloqueado, `next dev` loguea "Could not validate that a segment in your UI has instant navigation" (el segmento de la página queda sin renderizar por el gate). Es solo validación de dev; no aparece con el panel habilitado ni afecta el build.
- En navegación cliente entre secciones del panel el layout no se re-renderiza: si el estado cambia en medio de la sesión (p. ej. entra el pago), el gate se actualiza al recargar o al entrar desde "Mi cuenta"/el `back_url` de MP (carga completa).
- El nav del panel sigue visible con el panel bloqueado (sus links llevan al gate).
- `src/server/queries/landing.ts` sigue con `import "server-only"`; el test de DB lo mockea (`vi.mock("server-only")`) junto con `next/headers` y `next/navigation`.
- Datos de smoke (`smoke-025`, `PlatformSettings`) borrados de `barber_job_025` al terminar; dev server apagado.
