ESCALATE

**Motivo:** Cambio de schema + migración (modelo `Invitation`) y nueva ruta pública que crea sesión; el resto está en verde (4/4 PASS, AC con evidencia, checks OK).

## Notas
- Motivo duro de escalado: toca `prisma/schema.prisma` y agrega `prisma/migrations/20261121155934_invitations/migration.sql` (tabla nueva `Invitation`, índice único `tokenHash`, FKs con `ON DELETE CASCADE`). Es aditiva, no modifica ni borra columnas existentes. El propio spec dice que hay que escalarla.
- No toca `src/lib/auth.ts`, `src/proxy.ts`, `package.json`/`pnpm-lock.yaml`, variables de entorno ni secretos. No agrega componentes de shadcn.
- Superficie de auth a revisar: `/invitacion/[token]` es pública y llama a `createSession` (`src/server/actions/invitations.ts`). Lo verificado: token de 32 bytes base64url, en la DB solo queda el sha256, vence a las 48 h, es de un solo uso (`updateMany` condicionado a `usedAt: null`; con 3 envíos concurrentes se creó 1 sola sesión), mensaje genérico, `noindex` y `no-referrer`.
- Multi-tenant/IDOR: `updateBarber`, `regenerateInvitation`, el detalle y `changePassword` filtran por el `barbershopId` de la sesión. `changePassword` usa el `userId` de la sesión, y el builder probó inyectarle un `userId` ajeno.
- Las 4 reviews de la ronda 2 dicen `VERDICT: PASS`. AC-1..AC-8 tienen evidencia en build.md. lint, typecheck, test (234) y build pasan.
- Scope: las 36 rutas del diff están en Target Files, contando `cash/page.tsx`, que el orquestador agregó a mitad del job (solo cambia el texto y suma un link a Barberos). `payout-form.tsx` se borra, tal como pide AC-4. Se renombró el label "Configuración" a "Ajustes" (en la nav y en el h1/title de settings) para que entren 5 ítems en mobile. Es un cambio de UI que no estaba en el spec, pero los archivos están en scope.
- Antes de mergear: aplicar la migración en la DB destino (`prisma migrate deploy`). La base `barber_job_017` tiene usuarios de prueba de las e2e, y no afecta a main.
