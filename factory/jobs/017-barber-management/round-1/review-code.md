VERDICT: CHANGES

## Hallazgos
- [blocking] `src/lib/barbershop-settings.ts:200-212`: `payoutSchema`, `PayoutInput` y `PayoutData` quedaron sin ningún consumidor de producción. `updateBarberPayout` se eliminó y `updateBarberSchema` usa `resolvePayoutValue` y `payoutFields`. Solo los usa `barbershop-settings.test.ts`, así que es código muerto. → Eliminar `payoutSchema` y los dos tipos. Mover los casos de `describe("payoutSchema")` de `barbershop-settings.test.ts` a `updateBarberSchema` en `barbers.test.ts`, o testear `resolvePayoutValue` directo. Actualizar el comentario de `src/lib/barbers.ts:34`, que dice "mismas reglas que `payoutSchema`".
- [nit] `src/server/actions/barbershop.ts`: el comentario de cabecera quedó en una línea muy larga tras el retoque. Conviene partirlo.

## Verificado sin hallazgos
- Aceptar invitación (`src/server/actions/invitations.ts`):
  - La transacción hace `updateMany` con `usedAt: null` y `expiresAt > now`, y exige `count === 1`.
  - Después setea `passwordHash` con `updateMany` condicionado a `passwordHash: null` y `active`, y exige `count === 1`. Si falla, se hace rollback.
  - Invalida las demás invitaciones pendientes del usuario.
  - La sesión sale del `User` en la DB. El mensaje de error es el mismo para token inexistente, vencido o usado.
  - El scrypt corre fuera de la transacción.
- Regenerar (`src/server/actions/barbers.ts`): filtra por `barbershopId`, rechaza si el barbero ya está activo y re-chequea dentro de la transacción. Marca `usedAt` en las invitaciones previas y crea la nueva.
- Email único: chequeo previo y `P2002`, con el mismo mensaje genérico. No queda nada creado porque el `User` y la `Invitation` se crean en una transacción.
- IDOR: `updateBarber` usa `updateMany` con `id` y `barbershopId` de la sesión, y `count !== 1` devuelve `NOT_FOUND`.
- `await connection()` está después de `await params`, dentro de `<Suspense>`.
- El hash sha256 hex con Web Crypto está testeado contra `node:crypto`. El token tiene 32 bytes en base64url.
- Los componentes cliente solo importan Server Actions, no módulos `server-only`.
- `settings/payout-form.tsx`, la card de Liquidaciones, `updateBarberPayout` y `users` de `getBarbershopSettings` se eliminaron. `prisma migrate diff` no detecta drift.

## Revisado
lint ✅ · typecheck ✅ · test ✅ · build ✅ · drift ✅ · scope ✅ (todos los archivos dentro de Target Files) · AC-1..AC-8 ✅ salvo el código muerto indicado arriba
