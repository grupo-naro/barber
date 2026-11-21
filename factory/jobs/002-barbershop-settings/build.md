# Build: 002-barbershop-settings
**Rama:** factory/002-barbershop-settings · **Commit:** 44656a6 · **Worktree:** .worktrees/002-barbershop-settings

## Qué cambió
- `src/lib/barbershop-settings.ts`: esquemas Zod puros (perfil, horarios, liquidación), `normalizeDecimal` (string decimal sin pasar por float), helpers de errores, labels de días/esquemas y tipo `ActionResult`. Reusa `isValidTime` de `src/lib/slots.ts`.
- `src/lib/barbershop-settings.test.ts`: 36 tests de Vitest (AC-1).
- `src/server/queries/barbershop.ts`: `getBarbershopSettings(barbershopId)` → perfil + 7 días (los que no tienen fila salen cerrados) + todos los usuarios (activos e inactivos) con `payoutValue` como string.
- `src/server/actions/barbershop.ts`: `updateBarbershopProfile`, `updateOpeningHours` (upsert de los 7 días en `$transaction`), `updateBarberPayout` (`updateMany` con `where: { id, barbershopId }`; `count !== 1` → error). Orden: `safeParse` → sesión OWNER → query con el `barbershopId` de la sesión. Perfil → `updateTag` del branding público + `revalidatePath("/dashboard/settings")`.
- `src/app/[slug]/data.ts`: solo se agregó `cacheTag(barbershopBrandingTag(slug))` a `getCachedBarbershop` y se exportó el helper del tag.
- `src/app/(dashboard)/dashboard/settings/page.tsx`: Server Component; `requireRole("OWNER")` y la lectura de DB dentro de `<Suspense>`; tres Cards.
- `src/app/(dashboard)/dashboard/settings/profile-form.tsx`: formulario de perfil (inputs controlados, `<textarea>` nativo, vista previa del logo con `<img>` solo si la URL es http(s)).
- `src/app/(dashboard)/dashboard/settings/hours-form.tsx`: una fila por día, lunes primero, casilla "Cerrado" + dos `<input type="time">`.
- `src/app/(dashboard)/dashboard/settings/payout-form.tsx`: un formulario por usuario con `<select>` nativo de esquema + valor ("%" / "$"), con la regla vigente formateada en ARS.
- `src/app/(dashboard)/dashboard/settings/form-ui.tsx`: clases de los controles nativos (solo tokens de tema), `FieldError` y `FormStatus` (`aria-live="polite"`, siempre montado).

Nota de diseño: en las actions el rol se verifica con `getSession()` + `role === "OWNER"` en lugar de `requireRole`, así un BARBER (o una sesión vencida) recibe `{ ok: false, error }` en vez de un redirect a mitad de la action, como pide AC-5 ("devuelven error"). La página sí usa `requireRole("OWNER")`.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `pnpm exec vitest run src/lib/barbershop-settings.test.ts` → 36 passed: vacíos→null, WhatsApp `+54 9 (11) 1234-5678`→`+5491112345678`; rechaza name vacío, `javascript:`, URL sin protocolo, `data:`, `ftp:`, WhatsApp <8 dígitos; horarios: open>=close, "25:00", repetidos, ≠7, día cerrado → horas null; payout: PERCENTAGE 101/100.01/-1, FIXED_RENT 3 decimales, NONE → "0". |
| AC-2 | ✅ | Seed + cookie de sesión firmada. Sin sesión → `307 /login?next=%2Fdashboard%2Fsettings`. BARBER → `NEXT_REDIRECT;replace;/dashboard;307` (en streaming, igual que el resto del panel). OWNER → 200 con nombre, descripción, dirección y WhatsApp (`+5491155443322`) en los inputs (el logo del seed está vacío), `closed-0` marcado, lunes 10:00–20:00, sábado 09:00–18:00, "Actual: 50 % de lo facturado" (Martín) y "Alquiler fijo de $ 120.000,00" (Nicolás). |
| AC-3 | ✅ | Con `/barberia-demo` ya en caché, se envió el perfil "Barbería Renovada" / "Cortes y barba" → "Perfil guardado." y el siguiente GET de `/barberia-demo` ya muestra el `<h1>` y la descripción nuevos (`updateTag`). Un perfil inválido (name vacío + `javascript:alert(1)`) → "Ingresá el nombre…" + "El logo tiene que ser una URL…" junto a cada campo; la DB no cambia. BARBER → "No tenés permiso…", sin escritura. |
| AC-4 | ✅ | Se borró a mano la fila del miércoles y se guardó con lunes cerrado + domingo 10:00–14:00 → "Horarios guardados."; DB: `0:10:00-14:00 1:closed 2..6 sin cambios rows=7`. Página pública: el domingo 2026-11-22 ofrece 10:00…13:30 (15 slots de 30 min); el lunes 2026-11-23 → "cerrados. Elegí otro día.". Antes de eso, domingo 14:00–10:00 → "El cierre tiene que ser después de la apertura" y no cambió ningún día (incluido el lunes). |
| AC-5 | ✅ | Lucas `PERCENTAGE 40` → `FIXED_RENT 90000` → "Liquidación guardada."; DB `FIXED_RENT 90000` (`Decimal`). OWNER con el `userId` del owner de `otra-barberia` → "No encontramos ese usuario en tu barbería." y ese usuario sigue `NONE 0`. BARBER (Martín) → "No tenés permiso…" en las tres actions, sin cambios. PERCENTAGE 101 → error de campo. Todo `where` de escritura usa `session.barbershopId`. |
| AC-6 | ✅ | Chrome headless (CDP) a 375 px con sesión OWNER: `scrollWidth 375 == clientWidth 375`, 39 controles, ninguno de menos de 44 px (en las casillas se mide el `<label>` que las envuelve), ninguno sin `<label>` asociado y ningún elemento que se pase de 375 px. Captura revisada. El grep de colores crudos (`bg-red-…`, `#hex`, etc.) en `settings/` no encontró nada. |
| AC-7 | ✅ | Ver Checks. |

## Checks
lint ✅ · typecheck ✅ · test ✅ (6 archivos, 63 tests) · build ✅ (`/dashboard/settings` ◐ Partial Prerender)

Nota: la base `barber_job_002` quedó con los datos de las pruebas manuales (nombre "Barbería Renovada", lunes cerrado, Lucas FIXED_RENT 90000). `pnpm exec prisma db seed` la vuelve al estado inicial.
