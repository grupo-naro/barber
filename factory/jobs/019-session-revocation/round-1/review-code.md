VERDICT: PASS

## Hallazgos
- [nit] `src/proxy.ts:50`: `isSuspendedNotice` quedó exportada solo para sus tests (en `src/proxy.test.ts`), y producción ya usa `isLoginNotice`. Es código muerto en runtime → borrarla y sus 2 tests en un job posterior (018 queda cubierto por `isLoginNotice`).
- [nit] `src/lib/session.test.ts`: usa `payload!.issuedAt` (non-null assertion) en dos tests → `expect(payload).not.toBeNull()` más `payload?.issuedAt`.
- [nit] `src/lib/auth.ts`: exportar `INACTIVE_MESSAGE` y `EXPIRED_MESSAGE` desde auth.ts es coherente con la spec (AC-7, constantes exportadas). `SUSPENDED_MESSAGE` vive en `platform-admin`, así que los textos quedan repartidos en dos módulos. Es aceptable.

## Revisado
- `isSessionRevoked` compara con `Math.floor(ms/1000)` y está bien. Los tests cubren null, iat anterior, mismo segundo (x.000 y x.999), un segundo después, sin iat, y que `signSession` emite `iat` y `verifySession` lo devuelve.
- `passwordChangedAt` se escribe en el mismo `updateMany` / `update` que el `passwordHash`: en `changePassword`, y en `acceptInvitation` dentro de la transacción (INVITE y RESET).
- `changePassword` re-emite la sesión con `createSession` y datos de la DB, después del update exitoso, y su `iat` es posterior al cambio.
- `getSession` sigue haciendo una sola lectura de DB. `lookupSession` agrega `passwordChangedAt` al `select` existente.
- Orden de rechazo: `inactive`, `suspended`, `expired`. `requireSession` redirige con rutas constantes. La cookie rechazada se ignora, no se borra.
- `isLoginNotice` solo acepta el valor exacto `"1"`, y `next` sigue pasando por `safeNextPath`.
- La migración es una sola columna nullable y es coherente con el schema.
- Sin `any` ni `@ts-ignore`.
- lint ✅ · typecheck ✅ · test ✅ · build ✅ · booking-smoke OK ✅ · scope ✅ (10 archivos, todos dentro del scope) · AC-1..AC-8 ✅. Nota: no verifiqué la prueba manual con curl de AC-4.
