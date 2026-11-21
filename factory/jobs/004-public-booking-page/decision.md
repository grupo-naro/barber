APPROVE

**Motivo:** 4 reviews de ronda 2 en PASS, AC-1..AC-6 con evidencia y checks en verde, diff 100% dentro del scope sin hot files, schema, deps, auth ni env.

## Notas
- Diff `main...HEAD`: 12 archivos, sólo altas (+1614), todos en el scope del spec (`src/lib/slots*`, `src/server/{queries/,actions/,}booking.ts`, `src/app/[slug]/**`, `scripts/booking-smoke.ts`). No toca `src/proxy.ts`, `src/lib/auth.ts`, `prisma/`, `package.json`/lockfile ni `.env`. `dotenv` y `tsx` ya estaban en `package.json`.
- Merge contra el `main` actual (con 001 mergeado): `git merge-tree` limpio. El `matcher` de `src/proxy.ts` (001) no cubre `/[slug]`, así que la página pública no queda detrás del login.
- Único borrado de datos: `wipe()` en `scripts/booking-smoke.ts` (`deleteMany`/`delete`). Está acotado a las barberías fixture `smoke-004` y `smoke-004-other`, lo pide el spec explícitamente y es un script de dev, no código de producto.
- Seguimientos (fuera de alcance, aceptados por las reviews): 404 que devuelve 200 en el primer request de `next start` (resolver en `src/proxy.ts`); rate limit o captcha en la reserva pública; exclusion constraint en DB (cualquier otro camino que cree o mueva `Appointment` tiene que tomar `pg_advisory_xact_lock(hashtext(barberId))`); `logoUrl` arbitrario en `<img>`; un anónimo que conoce un teléfono puede renombrar al `Customer` (lo permite el spec; se puede cambiar a `update: {}`).
