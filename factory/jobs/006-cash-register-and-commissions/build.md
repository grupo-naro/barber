# Build: 006-cash-register-and-commissions
**Rama:** factory/006-cash-register-and-commissions · **Commit:** a5354aa · **Worktree:** .worktrees/006-cash-register-and-commissions

## Qué cambió
- `src/lib/payouts.ts`: lógica pura en centavos `bigint`: `decimalToCents`/`centsToDecimal` con signo, `computePayout` (PERCENTAGE half-up, FIXED_RENT = alquiler diario, NONE) y `summarizeDay` (totales por medio de pago y liquidación por barbero, ordenada por nombre).
- `src/lib/payouts.test.ts`: tests de Vitest para `computePayout` y `summarizeDay` (15 tests).
- `src/server/queries/cash.ts`: `getCashDay` (snapshot si el día está cerrado, vista previa con el acuerdo vigente si no) y `closeCashDay` (cierre en una `db.$transaction`, recibe `barbershopId`/`userId`/`timeZone`; P2002 → "Ya se cerró la caja de ese día"). No depende de Next ni de `server-only` porque lo importa el smoke vía `tsx`.
- `src/server/actions/cash.ts`: `closeCashRegister` (Zod `safeParse` → `requireRole("OWNER")` → `closeCashDay` con los datos de la sesión → `revalidatePath("/dashboard/cash")`).
- `src/app/(dashboard)/dashboard/cash/page.tsx`: página OWNER dentro de `<Suspense>`: selector de fecha (input date + día anterior/siguiente), totales por medio de pago, liquidación por barbero (los negativos en `text-destructive` con "Debe a la barbería"), totales para barberos/barbería, badge "Caja cerrada" con quién/cuándo/notas, o el formulario de cierre si la caja está abierta.
- `src/app/(dashboard)/dashboard/cash/close-form.tsx`: cliente mínimo con `useActionState`, notas y `window.confirm` antes de enviar.
- `scripts/cash-smoke.ts`: fixture idempotente (`smoke-006` con Ana NONE / Bruno PERCENTAGE 50 / Carla FIXED_RENT 8000, y `smoke-006-other`) más 29 verificaciones ✓/✗ con exit code. Deja ayer cerrado y hoy abierto. Login: `dueno@smoke-006.test` / `barber123`.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `payouts.test.ts`: 50 % de 10000 → 5000/5000; 33.33 % de 100.01 → 33.33/66.68 y la suma da exacto; mitades half-up (0.005 → 0.01); 0 % y 100 %; NONE; FIXED_RENT 8000 con 20000 → 12000/8000 y con 5000 → −3000/8000. Montos como string/bigint. |
| AC-2 | ✅ | `summarizeDay` con 2 barberos y los 4 medios de pago: CASH 0.10+0.20 = 0.30, totales y bruto por barbero exactos, Σ(barber+shop) = total general, los barberos sin registros quedan afuera. |
| AC-3 | ✅ | curl en :3001: sin cookie → 307 `/login?next=%2Fdashboard%2Fcash`; con BARBER → `NEXT_REDIRECT;replace;/dashboard` y sin datos de caja; POST de la action `closeCashRegister` (form MPA con los `$ACTION_*`) como BARBER → 303 a `/dashboard` y 0 cierres creados. Todas las queries filtran por `barbershopId`; en el smoke, los registros de `smoke-006-other` del mismo día no aparecen ni se cierran. |
| AC-4 | ✅ | Como OWNER, `/dashboard/cash` (sin `?date` → hoy, 2026-11-20 en BA) y `?date=2026-11-19` muestran los totales que imprime el smoke ($ 36.500,85 en total, Bruno $ 9.750,38, a barberos $ 6.750,38, barbería $ 29.750,47). Carla aparece con "Debe a la barbería $ 3.000,00" en rojo. Con `?date=basura` se muestra hoy. |
| AC-5 | ✅ | `pnpm exec tsx scripts/cash-smoke.ts` → OK, exit 0, también en una segunda corrida (idempotente). Verifica 1 cierre con los totales correctos, un `BarberPayout` por barbero con `scheme`/`schemeValue` copiados, los registros del día con `cashCloseId` y `smoke-006-other` sin tocar. Extra: 3 cierres concurrentes → gana exactamente uno. |
| AC-6 | ✅ | El smoke verifica que el segundo cierre devuelve "Ya se cerró la caja de ese día" sin crear filas, que el día vacío devuelve "No hay cortes para cerrar ese día" y que un cambio de `payoutValue` no altera el snapshot. Por HTTP: con Carla en 9000, el día cerrado sigue mostrando alquiler $ 8.000 y debe $ 3.000, el día abierto muestra 9000 y debe $ 4.000, y el día cerrado no tiene "Cerrar caja". Un POST repetido de la action sobre un día cerrado responde 200 con el mensaje de error, sin 500. |
| AC-7 | ✅ | Los cuatro checks pasan (ver abajo). |

## Checks
lint ✅ · typecheck ✅ · test ✅ (92 tests) · build ✅

## Notas
- Una fecha futura en `?date` también cae a hoy (el spec pedía eso solo para las fechas inválidas), y `closeCashDay` rechaza cerrar un día futuro.
- Si un registro se crea mientras se está cerrando un día, queda afuera del cierre. La página del día cerrado lo avisa ("Hay N cortes de este día sin cerrar"). Es la limitación de MVP que ya figura en Riesgos.
- Supuesto de FIXED_RENT tal cual el spec: alquiler diario, y solo en los días en que el barbero tiene registros.

## Respuesta a la ronda 1
Commit a5354aa. Checks: lint ✅ · typecheck ✅ · test ✅ (92) · build ✅ · `cash-smoke` ✅ en 11 de 11 corridas seguidas.
- code [blocking] carrera de cierres simultáneos: lo arreglé. `closeCashDay` toma `pg_advisory_xact_lock(hashtextextended('cash-close:<barbershopId>:<fecha>', 0))` al empezar la transacción, antes del chequeo de cierre existente. Así los cierres del mismo día de la misma barbería se serializan: el que pierde espera a que el ganador haga commit, ve el `CashRegisterClose` y responde "Ya se cerró la caja de ese día". El mapeo de P2002 queda como red de seguridad. El smoke ahora repite la carrera en 6 días con 4 cierres simultáneos por día y verifica 1 ganador por día, que los 18 perdedores reciben exactamente "Ya se cerró…" y que cada cierre queda completo (2 registros y 2 payouts). Para confirmar que el smoke detecta el problema, desactivé el lock a propósito: falló en 2 de 4 corridas. Con el lock pasó 11 de 11.
- code [nit] el `!` en `summarizeDay`: lo saqué. El barbero se guarda en el mapa `gross`.
- code [nit] la query extra de `openAfterClose`: no la toqué. El reviewer la marcó como aceptable y es la que avisa de registros que quedaron afuera del cierre.
- security [nit] que `summarizeDay` lance y termine en 500: ahora se mapea a `CLOSE_ERRORS.changed` dentro de la transacción.
- security [nit] guarda de producción en el smoke: si `NODE_ENV=production`, aborta con exit 1.
- security [nit] `server-only` en `queries/cash.ts`: no lo cambié. Separar el núcleo de un wrapper con `server-only` exige un archivo nuevo fuera de scope (o una regla de lint). Hoy ningún componente cliente lo importa. Queda para un job futuro.
- ui/ux [nit] la fila por barbero a 360px: arreglado. En pantallas de menos de 420px se apila en filas `etiqueta … monto` (justify-between), y de 420px en adelante usa 3 columnas.
- ui [nit] los montos por medio de pago ahora son `text-base font-semibold`.
- ux [nit] la confirmación de "Cerrar caja" ahora muestra el total del día y cuántos barberos quedan debiendo a la barbería.
- ux [nit] ancla para ir a cerrar / el mensaje de éxito que se pierde: no los cambié. Son opcionales y el badge "Caja cerrada" junto con la tarjeta "Cierre" ya confirman el resultado.
