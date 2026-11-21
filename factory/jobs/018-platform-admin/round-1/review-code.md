VERDICT: PASS

## Hallazgos
- [nit] `src/server/actions/admin.ts` `updateBarbershop`: el chequeo previo de slug y email y la transacción no son atómicos, pero la carrera está cubierta por el `P2002` (`uniqueViolation`). Sin acción.
- [nit] `getSession` y `requireSession` comparten `lookupSession` memoizado con `cache()`. El `select` de `barbershop` va en la misma query que el `User`, así que no suma ningún round-trip. Correcto.
- [nit] `monthRange` calcula el mes con `businessDate(now, tz)` y los límites con `zonedTimeToUtc`. La implementación es correcta: el 1 de mes a las 00:30 en Buenos Aires ya es el mes nuevo en la timezone de negocio. La frase del spec estaba invertida y el builder tiene razón.

## Revisado
- Migración: enums nuevos, `status` con default ACTIVE, `plan` con default FREE, `planExpiresAt` y `lastLoginAt` nullable, `Invitation.kind` con default INVITE. No se borra nada y las filas del job 017 siguen válidas. `prisma migrate diff --exit-code` da 0, sin drift.
- Listado de `/admin`: 1 `findMany` más 6 `groupBy` en paralelo, sin N+1. Los límites del mes salen de `monthRange` en la timezone de Buenos Aires.
- `updateTag` se llama con el slug viejo y con el nuevo al editar, y al cambiar el estado. También se llama al crear, por si había un "no existe" cacheado.
- Suspensión: `login` verifica la contraseña antes de devolver el mensaje de suspendida. `getSession` devuelve `null` y `requireSession` redirige a `/login?suspended=1`. El proxy no rebota ese path a `/dashboard`, así que no hay loop. `acceptInvitation` rechaza las barberías suspendidas. `landing`, `slug-exists` y `booking` filtran por `status: "ACTIVE"`.
- `acceptInvitation` con `RESET` y `INVITE` está bien: el `INVITE` exige `passwordHash: null` y el `RESET` pisa el hash.
- Proxy: `decideAdminRoute` se aplica antes del chequeo de slug. El matcher incluye `/admin` y `/admin/:path*`.
- Actions de admin: Zod `safeParse` → `getAdminSession()` → query, en ese orden.
- `scripts/create-admin.ts`: contraseña con `crypto.getRandomValues`, falla con código 1 si el email ya existe (chequeo previo más `P2002`) y no la pisa.
- Tests: los de audience separation y suspensión están presentes.
- Scope: todos los archivos del diff están dentro de `## Target Files (Scope)`.
- TypeScript estricto: sin `any` ni `@ts-ignore`.

lint ✅ · typecheck ✅ · test ✅ · build ✅ · `booking-smoke` OK ✅ · migrate diff sin drift ✅ · scope ✅ · AC-1..AC-8 ✅
