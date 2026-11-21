ESCALATE

**Motivo:** Las 4 reviews dan PASS y los checks pasan, pero el cambio toca auth/sesiones (`src/lib/auth.ts`, `src/proxy.ts`), agrega dependencias (`jose`, `server-only`) y una variable de entorno secreta (`SESSION_SECRET`), así que requiere un humano.

## Notas
- Ronda 2: code, security, ui y ux con `VERDICT: PASS`. El open redirect bloqueante de la ronda 1 se corrigió con `safeNextPath` (resuelve con WHATWG contra un origen fijo, exige mismo origen y ruta privada) y tiene tests.
- AC-1..AC-8 tienen evidencia en `build.md`; lint, typecheck, test (17) y build en verde. El diff (17 archivos) está dentro del scope del spec, sin cambios de schema ni de migraciones.
- Disparadores de escalado (todos los pide el spec, pero no se pueden aprobar en automático): `src/lib/auth.ts` y `src/proxy.ts` nuevos, `jose` y `server-only` en `package.json`/`pnpm-lock.yaml`, `SESSION_SECRET` en `.env.example`, y un seed que borra datos (solo los tenants `barberia-demo` y `otra-barberia`).
- Qué debería mirar un humano:
  - `getSession` re-lee el `User` en la DB (existe, `active`, `barbershopId` coincide) y toma el rol de la DB. Revisar que esto alcance como base multi-tenant para los jobs 002–006.
  - La sesión es un JWT sin estado: un token copiado sigue sirviendo hasta 7 días después del logout. Solo se revoca desactivando al usuario o cambiándolo de barbería. Hoy está aceptado como fuera de alcance; más adelante se puede agregar un `sessionVersion`.
  - Falta el rate limit del login (hay un `TODO`). Hay que hacerlo antes de ir a producción.
  - Antes de mergear, cada entorno tiene que tener un `SESSION_SECRET` de al menos 32 caracteres. Si falta, el proxy y las rutas privadas fallan con un error (AC-7).
  - Detalle menor: `src/server/actions/auth.ts` importa `safeNextPath` desde `@/proxy`. Más adelante conviene moverlo a `src/lib/`.
- El seed deja el domingo sin turnos porque ese día está `closed`. Contradice el pedido de "turnos para los 7 días", pero es coherente con "dentro del horario de apertura", y está documentado.
