VERDICT: PASS

## Hallazgos
- [nit] `src/server/queries/cash.ts:1`: no importa `server-only` (para que `tsx` pueda usarlo en el smoke). Hoy ningún componente cliente lo importa; `close-form.tsx` importa solo la action y su tipo. Pero un import futuro desde un componente `"use client"` metería `db` en el bundle sin que el build avise. → Más adelante conviene separar `closeCashDay`/`getCashDay` en un núcleo sin Next y un wrapper con `import "server-only"` para la app, o agregar una regla de lint que impida importar `@/server/queries/*` desde componentes cliente.
- [nit] `src/server/queries/cash.ts:233`: un `summarizeDay` que lanza "Barbero desconocido" o un `decimalToCents` que lanza "Monto inválido" se re-lanza y termina en un 500 genérico. En producción no filtra internals, así que no bloquea. Si se quiere un mensaje amable, se puede mapear a `CLOSE_ERRORS.changed`.
- [nit] `scripts/cash-smoke.ts:97`: borra y recrea las barberías `smoke-006*` con una contraseña conocida (`barber123`) y no tiene guarda contra `NODE_ENV=production`. Es el mismo patrón que `booking-smoke.ts` y es solo para desarrollo. → Más adelante conviene agregar una guarda que aborte si `NODE_ENV === "production"`.

Verificado sin problemas:
- **Solo OWNER:** la página llama a `requireRole("OWNER")` dentro de `<Suspense>` antes de cualquier query, y la action también, después de Zod y antes de `closeCashDay`. `requireRole` vuelve a leer el rol y `active` de la DB en cada request, así que un BARBER no ve liquidaciones de otros barberos ni totales de la barbería, y no puede cerrar la caja. No hay otra action exportada en `cash.ts`.
- **Aislamiento multi-tenant:** `barbershopId`, `userId` y `timeZone` salen siempre de la sesión, nunca de formData ni de searchParams. Las queries que filtran por `barbershopId` son:
  - `cashRegisterClose.findUnique` por la clave compuesta `(barbershopId, businessDate)`;
  - `serviceRecord.findMany`, `serviceRecord.count` y `serviceRecord.updateMany`;
  - `user.findMany`.

  Los payouts y los nombres de barberos se leen a través del cierre, que ya está acotado a la barbería. Cerrar por otra barbería no es forjable: el form solo manda `date` y `notes`.
- **Fecha validada:** en la página, `?date` pasa por `isValidDate` (regex anclado `^\d{4}-\d{2}-\d{2}$` más chequeo de calendario) y por `<= today`; si no cumple, cae a hoy. La action usa Zod con `isValidDate`, y `closeCashDay` vuelve a validar y rechaza días futuros en la timezone de la sesión. A Prisma solo llega `new Date("YYYY-MM-DDT00:00:00.000Z")`. Las notas se recortan a ≤ 500 caracteres y se renderizan como texto de React (sin `dangerouslySetInnerHTML`).
- **Cierre atómico y sin replay:** todo ocurre en una sola `db.$transaction`, que relee de la DB los registros abiertos y los acuerdos. No hay montos que vengan del cliente. El `updateMany` filtra por `cashCloseId: null` y `barbershopId`, y si el conteo no coincide hace rollback. Repetir el POST da "Ya se cerró la caja de ese día", porque la transacción encuentra el cierre existente o, en una carrera, salta la unique `(barbershopId, businessDate)` (P2002). En ningún caso hay 500 ni filas duplicadas.

## Revisado
Diff `main...HEAD` (7 archivos: `payouts.ts`/test, `server/actions/cash.ts`, `server/queries/cash.ts`, `dashboard/cash/page.tsx` y `close-form.tsx`, `scripts/cash-smoke.ts`), además de `lib/auth.ts`, `isValidDate` en `lib/slots.ts`, `spec.md` y `build.md`.
