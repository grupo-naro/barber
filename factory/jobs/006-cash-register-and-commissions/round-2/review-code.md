VERDICT: PASS

## Hallazgos
- Resuelto el [blocking] de la ronda 1: `closeCashDay` toma `pg_advisory_xact_lock(hashtextextended('cash-close:<barbershopId>:<date>', 0))` al inicio de la transacción, antes del chequeo `existing` y de leer los registros. Los cierres simultáneos se serializan y el perdedor ve el cierre committeado y responde "Ya se cerró la caja de ese día".
- Resuelto el [nit] del `!` en `payouts.ts`.
- [nit] `openAfterClose` queda como query extra (aceptado en la ronda 1).

## Revisado
lint ✅ · typecheck ✅ · test ✅ (92) · build ✅ · scope ✅ (7 archivos, todos en Target Files) · AC-1..AC-7 ✅
`pnpm exec tsx scripts/cash-smoke.ts`: 6 corridas seguidas, exit 0 las 6.
