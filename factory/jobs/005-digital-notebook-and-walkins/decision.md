APPROVE

**Motivo:** 4/4 reviews PASS, AC-1..AC-8 con evidencia y checks en verde, 12 archivos nuevos todos dentro del scope y sin schema, auth, dependencias ni secretos.

## Notas
- Diff `main...HEAD` (3 commits, hasta aa0eff6): 12 archivos, +1624/-0, todos en Target Files (`dashboard/today/**`, `src/server/{records,actions/records,queries/records}.ts`, `src/lib/records{,.test}.ts`). No toca hot files (`package.json`, lockfile, `prisma/**`, `src/lib/auth.ts`, `src/proxy.ts`, `src/components/ui/**`) ni rutas de los jobs 006 o de nav.
- Sin borrado de datos: sólo crea `ServiceRecord`/`Customer` y cambia el estado de turnos con `updateMany` condicional. `Customer.notes` sólo se edita desde la ficha (`where: { id, barbershopId }`).
- Por qué es seguro: todas las queries y mutaciones usan el `barbershopId` y el actor de `requireSession()`; los precios se leen de la DB dentro de la transacción y se suman en centavos; `dailyNumber` usa `pg_advisory_xact_lock` + `max+1` + reintento ante `P2002`; completar es idempotente (update condicional + `appointmentId @unique`). Hay bloqueo si existe `CashRegisterClose` del día.
- Checks: lint ✅ · typecheck ✅ · test ✅ (90/90) · build ✅.
- Para un humano (no bloquea): un BARBER puede ver en la ficha de cualquier cliente de su barbería los últimos cortes de otros barberos, con totales (está permitido por el spec; decidirlo como regla de negocio). `lookupCustomer` no tiene rate limit (requiere sesión y queda dentro del tenant). Ajustes de UX menores en los nits: errores con `role="alert"`, teléfono formateado y aviso tras completar un turno.
- Interacción con 006: este job sólo lee `CashRegisterClose`. Conviene mergear antes que 006 o verificar que 006 no cambie esa tabla.
