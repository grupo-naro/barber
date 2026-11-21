ESCALATE

**Motivo:** Técnicamente en verde (4 PASS, AC-1..7 con evidencia, diff en scope), pero la liquidación FIXED_RENT se apoya en un supuesto de negocio sin confirmar y los cierres son irreversibles.

## Notas
- Las 4 reviews de la ronda 2 dicen `VERDICT: PASS`. Los 7 AC tienen evidencia en `build.md`, y lint, typecheck, test (92) y build pasan. El smoke corrió 11 de 11 veces seguidas.
- El diff está dentro del scope: 7 archivos nuevos, todos en Target Files. No toca auth ni proxy, ni el schema o migraciones, ni dependencias ni el env.
- **Por qué decide un humano:** el spec marca `FIXED_RENT` como **SUPUESTO a confirmar** (alquiler de silla diario, se cobra solo los días con registros, `barberAmount` puede ser negativo). Ese supuesto define cuánto se le paga a cada barbero y queda **persistido** en `BarberPayout` al cerrar la caja. El MVP no permite reabrir ni editar un cierre. Si el acuerdo real es semanal o mensual, o se cobra todos los días, los cierres hechos antes de corregirlo quedan mal y no hay cómo arreglarlos desde la app.
- Qué confirmar: (1) que `payoutValue` en FIXED_RENT es el alquiler **diario**; (2) que no se cobra en días sin cortes; (3) que se acepta mostrar "Debe a la barbería" con saldo negativo. Si las tres son correctas → `/factory approve`. Si no → `/factory rework` cambiando `computePayout`/`summarizeDay` y el AC-1.
- Menores, no bloquean: `src/server/queries/cash.ts` no tiene `import "server-only"` (está justificado y quedó para un job futuro). `scripts/cash-smoke.ts` borra y recrea solo las barberías `smoke-006*` y aborta si `NODE_ENV=production`. Los registros que se crean mientras se cierra la caja quedan fuera del cierre: es una limitación conocida y la página la avisa.
- PERCENTAGE y NONE, la atomicidad (advisory lock + unique + rollback) y el multi-tenant (`barbershopId` siempre sale de la sesión) se ven correctos y seguros.
