VERDICT: PASS

## Hallazgos
- [nit] `src/server/actions/account.ts`: sigue sin rotar la sesión cuando cambia la contraseña. Queda fuera de alcance según el spec, como dijimos en la ronda 1. Lo dejo para un job futuro de `sessionVersion`.

## Revisado
Delta 816edef y 77a0efc. Los dos nits de Zod de la ronda 1 están resueltos: `regenerateInvitationSchema.safeParse` corre antes de la sesión y `tokenSchema.safeParse` antes de tocar la DB. El estado "Link vencido" (EXPIRED) sale solo cuando `passwordHash === null`, así que una cuenta con contraseña siempre es ACTIVE. Además `regenerateInvitation` sigue exigiendo en el servidor `role === "BARBER"` y `passwordHash === null`, y lo vuelve a chequear dentro de la transacción. Por eso "Generar nuevo link" no puede funcionar como reset de una cuenta activa, aunque alguien fuerce el form. El `select` nuevo de `invitations` trae solo `expiresAt` y se anida en una query filtrada por id + `barbershopId` de la sesión, sin exponer `tokenHash`. El cambio en `cash/page.tsx` es texto más un `Link` interno, sin riesgo.
