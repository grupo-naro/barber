VERDICT: PASS

## Hallazgos
- [nit] `src/server/queries/cash.ts:1`: sigue sin `import "server-only"`. El builder lo dejó para un job futuro y lo justificó. Hoy ningún componente cliente lo importa, así que no bloquea. → Separar un núcleo sin Next y un wrapper con `server-only`, o agregar una regla de lint.

Verificado en la ronda 2 (commit `a5354aa`):
- **Advisory lock en `closeCashDay` (`cash.ts:195`):**
  - **Query parametrizada:** usa el tagged template ``tx.$executeRaw`…${...}` ``, así que la clave viaja como parámetro (`$1`) y no se concatena en el SQL. No hay `$executeRawUnsafe` ni `Prisma.raw`, por lo que no hay inyección.
  - **Clave sin influencia entre tenants:** la clave es `cash-close:<barbershopId>:<date>`.
    - `barbershopId` sale de la sesión (`requireRole("OWNER")` en la action).
    - `date` pasó `isValidDate` dos veces (Zod y el inicio de `closeCashDay`), con formato `YYYY-MM-DD` anclado, y no puede ser futura. Por eso un usuario no puede armar la clave de otra barbería.
    - Una colisión de `hashtextextended` (64 bits) solo serializaría dos cierres por un instante. No expone ni altera datos, porque todas las lecturas y escrituras dentro de la transacción siguen filtrando por `barbershopId`.
  - **Liberación automática:** es `pg_advisory_xact_lock`, así que el lock se libera solo con el commit o el rollback y no puede quedar tomado.
- **Error de `summarizeDay`:** ahora se mapea a `CLOSE_ERRORS.changed` dentro de la transacción (`cash.ts:216-222`), así que hay rollback y un mensaje amable en vez de un 500. Esto resuelve el nit de la ronda 1.
- **Smoke:** `scripts/cash-smoke.ts` aborta con `NODE_ENV=production`. Esto resuelve el nit de la ronda 1.
- **Lo que no cambió:** la action sigue con el orden Zod → `requireRole("OWNER")` → query, con el tenant tomado de la sesión. Los cambios de UI (`close-form.tsx` y `page.tsx`) solo agregan props derivadas en el servidor (`totalLabel`, `debtors`) que se muestran a un OWNER en un `window.confirm`. No se expone nada nuevo a BARBER ni a páginas públicas, y no hay `dangerouslySetInnerHTML`.

## Revisado
Diff `main...HEAD` (3 commits, con foco en `a5354aa`): `server/queries/cash.ts`, `server/actions/cash.ts`, `dashboard/cash/page.tsx` y `close-form.tsx`, `scripts/cash-smoke.ts`, además de la review de la ronda 1 y la sección "Respuesta a la ronda 1" de `build.md`.
