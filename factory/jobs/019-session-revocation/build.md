# Build: 019-session-revocation
**Rama:** factory/019-session-revocation · **Commit:** e73a0b8 · **Worktree:** .worktrees/019-session-revocation

## Qué cambió
- `prisma/schema.prisma`: `User.passwordChangedAt DateTime?` (null = sin revocación). El seed no cambia.
- `prisma/migrations/20261121210000_session_revocation/migration.sql`: `ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3)`.
- `src/lib/session.ts`: `SessionPayload.issuedAt` (el `iat` en segundos, o `null` si falta), que devuelve `verifySession`. Función pura `isSessionRevoked(issuedAtSec, passwordChangedAt)` que compara a precisión de segundo.
- `src/lib/session.test.ts`: tests de `isSessionRevoked` (null, `iat` anterior, mismo segundo x.000/x.999, un segundo después, sin `iat`) y de que `signSession` emite `iat` y `verifySession` lo devuelve.
- `src/lib/auth.ts`: `lookupSession` agrega `passwordChangedAt` a la query que ya existía y devuelve `reason: "suspended" | "inactive" | "expired" | null`. Se exportan `SUSPENDED_LOGIN_PATH`, `INACTIVE_LOGIN_PATH`, `EXPIRED_LOGIN_PATH`, `INACTIVE_MESSAGE` y `EXPIRED_MESSAGE`. `requireSession` redirige a la ruta constante que corresponde al motivo.
- `src/proxy.ts`: `isLoginNotice(search)` (`suspended|inactive|expired` exactamente `"1"`) reemplaza a `isSuspendedNotice` en `decideRoute`. `isSuspendedNotice` se queda exportado por compatibilidad con los tests de 018.
- `src/proxy.test.ts`: casos para los tres avisos, valores inválidos, el recorrido anti-loop y `/login?expired=1&next=//evil.com`.
- `src/server/actions/account.ts`: `changePassword` guarda `passwordChangedAt` en el mismo `updateMany` que el hash y después llama a `createSession` con el `id`, `barbershopId` y `role` leídos de la DB.
- `src/server/actions/invitations.ts`: `acceptInvitation` (INVITE y RESET) guarda `passwordChangedAt: now` en el mismo `updateMany` que el hash. La sesión se sigue creando después de la transacción.
- `src/app/(auth)/login/page.tsx`: un solo `role="alert"`, con prioridad suspended > inactive > expired. Usa los textos constantes de `auth.ts`.

Notas:
- **Migración:** la creé con `pnpm exec prisma migrate dev --name session_revocation`, como pide AC-1. El brief del orquestador decía `user-password-changed-at`, pero seguí el spec. Prisma la generó con timestamp `20261121191352`, que queda **antes** de `20261121200000_split_opening_hours`, así que renombré la carpeta a `20261121210000_session_revocation` para mantener el orden y actualicé el `migration_name` en `_prisma_migrations` de `barber_job_019`.
- En el primer intento un `sed` también agregó la columna a `PlatformAdmin`. Lo corregí en el schema y en el SQL, y en `barber_job_019` hice `DROP COLUMN` a mano y actualicé el checksum. No usé `migrate reset` porque pide consentimiento del usuario. Después de eso, `prisma migrate diff --from-config-datasource --to-schema` da una migración vacía y `migrate status` dice "Database schema is up to date".
- Los textos de los avisos viven en `src/lib/auth.ts` porque `page.tsx` no puede exportar constantes arbitrarias y `platform-admin.ts` está fuera del scope.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | Hay migración nueva con la columna nullable. Las filas existentes quedaron en `null`: lo confirmé con un SELECT después del seed. El seed no cambió. |
| AC-2 | ✅ | `isSessionRevoked` hace `issuedAtSec < Math.floor(pca.getTime()/1000)`. Si es null nunca revoca; sin `iat` y con `passwordChangedAt` revoca. Los casos están en `src/lib/session.test.ts`. |
| AC-3 | ✅ | `passwordChangedAt` se guarda en el mismo update que el hash en `changePassword` y en `acceptInvitation` (INVITE/RESET). `lookupSession` lo lee en la misma query y devuelve `reason:"expired"`, con lo que `getSession()` da null y `requireSession` va a `/login?expired=1`. E2E: el cuerpo de `/dashboard/today` con la cookie B trae `NEXT_REDIRECT;replace;/login?expired=1`. |
| AC-4 | ✅ | Smoke descartable (`scripts/session-revocation-smoke.ts`, ya borrado, contra `barber_job_019`): `iat` A=B=1795288758, `passwordChangedAt`=2026-11-21T19:19:20.078Z, A'=1795288760, resultado `revocado: {A:true, B:true, A':false}` y "SMOKE OK". Prueba manual con curl contra `pnpm start -p 3001` y dos jars de lucas: A cambia la contraseña ("Listo, cambiamos tu contraseña" + `Set-Cookie: session=…` nuevo) y A sigue en `/dashboard/today` con 200 y sin redirect. Con B, `/dashboard/today` hace un redirect en streaming a `/login?expired=1`; esa URL devuelve 200, 0 redirects y el aviso "Tu sesión se cerró porque cambió la contraseña. Ingresá de nuevo.". |
| AC-5 | ✅ | Con martin logueado, puse `active=false` en la DB: `/dashboard/today` y `/dashboard/account` hacen un redirect en streaming a `/login?inactive=1`, y `/login?inactive=1` devuelve 200 con 0 redirects y el aviso. Sin cookie, `/dashboard/today` sigue yendo a `/login?next=…`. El orden inactive → suspended es el mismo de 018 y se agrega expired al final. La cookie no se borra en ningún lado. |
| AC-6 | ✅ | En `proxy.test.ts`: `?inactive=0`, `?expired=true`, `?expired=`, `?inactive=11` y `?other=1` con sesión van a `/dashboard`. Los tres avisos dan `next`. Está el recorrido anti-loop, y `/login?expired=1&next=//evil.com` da `next` sin `location` (`safeNextPath` lo resuelve como `/dashboard`). Con curl: `/login?inactive=0` y `/login?expired=true` con JWT válido terminan en `/dashboard/today` (2 hops), y `/login?expired=1&next=//evil.com` da 200 con 0 redirects. Ninguna corrida de `curl -L --max-redirs 5` entró en loop. Los tests de 018 pasan sin cambios. |
| AC-7 | ✅ | `/login?inactive=1` y `/login?expired=1` muestran sus textos. `?suspended=1&inactive=1&expired=1` muestra solo el de suspendida e `?inactive=1&expired=1` solo el de inactivo. Login desde `/login?expired=1` con la contraseña nueva: 303 a `/dashboard`, y la cookie nueva entra a `/dashboard/today` sin redirect. Un inactivo que intenta loguearse recibe el error genérico, igual que antes. |
| AC-8 | ✅ | Ver Checks. |

Extra: `pnpm exec tsx scripts/booking-smoke.ts` termina en `OK`.

Detalle: como `requireSession` corre dentro de `<Suspense>` (PPR/cacheComponents), el redirect de una página del panel con sesión rechazada llega en el stream (`<meta http-equiv="refresh" content="1;url=/login?expired=1">` más el `NEXT_REDIRECT` de RSC) y no como 307. Por eso curl ve 200 en `/dashboard/today` y verifiqué el destino en el cuerpo. Es el mismo comportamiento que ya tenía `suspended` en 018.

## Checks
lint ✅ · typecheck ✅ · test ✅ (18 archivos, 301 tests) · build ✅
