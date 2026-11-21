# Revocación de sesiones por cambio de contraseña y fin del loop de usuarios inactivos

**Pedido:** Invalidar sesiones de barbería al cambiar la contraseña o al usar un link RESET, y cortar el loop /login ↔ /dashboard de usuarios inactivos con JWT vigente.

## Contexto
- `src/lib/session.ts`: `signSession` ya llama a `.setIssuedAt()`, así que todo JWT de barbería lleva `iat` en segundos. `verifySession` descarta `iat` y devuelve `{ userId, barbershopId, role, expiresAt }`. Es importable desde el proxy, así que no puede usar DB ni `next/headers`.
- `src/lib/auth.ts`: `lookupSession` (memoizado con `cache`) verifica el JWT y re-lee el `User` (con `active` y `barbershop`) en una sola query. Hoy distingue un único motivo de rechazo, `suspended`, y en ese caso `requireSession` redirige a `SUSPENDED_LOGIN_PATH = "/login?suspended=1"`. Si el usuario no existe, está inactivo o tiene otro `barbershopId`, devuelve `none` y `requireSession` manda a `/login`. Como el JWT sigue siendo válido, el proxy rebota a `/dashboard` y se arma el **loop**. Es el bug previo que quedó documentado en `factory/jobs/018-platform-admin/build.md` y `decision.md`.
- `src/proxy.ts`: `decideRoute` redirige `/login` a `/dashboard` cuando hay JWT válido, salvo si `isSuspendedNotice(search)` (`suspended=1`). `safeNextPath` es el anti open-redirect del `next`. Los tests están en `src/proxy.test.ts`, en el bloque "barbería suspendida".
- `src/server/actions/account.ts` (`changePassword`, job 017): hace un `updateMany` condicionado al hash leído y no toca la cookie.
- `src/server/actions/invitations.ts` (`acceptInvitation`, INVITE/RESET): actualiza `passwordHash` dentro de una transacción y después llama a `createSession(user)`.
- `src/app/(auth)/login/page.tsx`: lee `searchParams` dentro de `<Suspense>` y muestra `SUSPENDED_MESSAGE` si `suspended === "1"`.
- `prisma/schema.prisma` → `model User`: no tiene ningún campo que registre cuándo cambió la contraseña.
- El admin de la plataforma (`admin-session.ts`, `admin-auth.ts`, `/admin/**`) queda **fuera** de este job (es el job 020).
- Docs de Next 16 que tiene que leer el builder: `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, `02-guides/authentication.md`, `02-guides/authentication-with-cache-components.md`, `03-api-reference/04-functions/cookies.md` (las cookies solo se escriben en Server Actions, Route Handlers o el proxy, nunca al renderizar un Server Component) y `03-api-reference/04-functions/redirect.md`.

## Criterios de aceptación
- **AC-1 Schema:** `User.passwordChangedAt DateTime?` sale con una migración nueva en `prisma/migrations/`, creada con `pnpm exec prisma migrate dev --name session_revocation`. Las filas existentes quedan en `null`, que significa "sin revocación". El seed no cambia.
- **AC-2 Comparación pura y testeada:** `verifySession` también expone el `iat` del token (por ejemplo `issuedAt` en segundos, en `SessionPayload`). `src/lib/session.ts` agrega una función pura, por ejemplo `isSessionRevoked(issuedAtSec, passwordChangedAt: Date | null)`, que compara **a precisión de segundo**: la sesión está revocada si `issuedAtSec < Math.floor(passwordChangedAt.getTime() / 1000)`. Así, un token emitido en el mismo segundo del cambio o después sigue valiendo, y la cookie nueva del dispositivo actual no se auto-revoca por los milisegundos. Si `passwordChangedAt` es null, nunca está revocada. Un token sin `iat` con `passwordChangedAt` no nulo cuenta como revocado. `src/lib/session.test.ts` cubre:
  - null;
  - `iat` anterior;
  - el mismo segundo, con `passwordChangedAt` en x.000 y en x.999;
  - un segundo después;
  - que `signSession` emite `iat` y `verifySession` lo devuelve.
- **AC-3 Se marca el cambio de contraseña y se revoca:** `changePassword` (account), `acceptInvitation` con INVITE y con RESET guardan `passwordChangedAt: now` en el **mismo** update que escribe el `passwordHash`. `lookupSession` en `auth.ts` selecciona `passwordChangedAt` en la query que ya existe (sin queries extra) y, si `isSessionRevoked`, rechaza con el motivo `expired`: `getSession()` devuelve `null` y `requireSession()` redirige a `/login?expired=1`.
- **AC-4 El dispositivo actual sigue logueado:** después de un `updateMany` exitoso, `changePassword` llama a `createSession(...)` con el usuario y el rol de la DB, así se re-emite la cookie y solo se cierran los **otros** dispositivos. `acceptInvitation` sigue creando su sesión después de la transacción, y esa sesión es válida. Para verificarlo, el builder corre un smoke script descartable (en `scripts/` o el scratchpad, sin commitearlo) contra la DB del worktree y deja el resultado en `build.md`:
  - firma el token A y el token B con `iat` anterior al cambio;
  - simula el cambio de contraseña (`passwordChangedAt = now`);
  - firma el token A' (el re-emitido);
  - comprueba con `isSessionRevoked` y el `passwordChangedAt` de la DB que B queda rechazado y A' aceptado.

  Además, una prueba manual con curl o el navegador en el puerto del worktree: con dos cookies del mismo usuario, se cambia la contraseña con una. Esa cookie sigue entrando a `/dashboard/today` (200). Con la otra, `/dashboard/today` termina en `/login?expired=1`, que devuelve 200 con el aviso y no entra en loop.
- **AC-5 Fin del loop de usuarios inactivos:** si el `User` no existe, tiene `active=false` o su `barbershopId` no coincide con el del JWT, `lookupSession` rechaza con el motivo `inactive`. `requireSession` redirige a `/login?inactive=1`. El motivo `suspended` y su orden de evaluación quedan igual que en 018. El resultado del lookup pasa a ser un motivo único, por ejemplo `reason: "suspended" | "inactive" | "expired" | null`, con las rutas como constantes exportadas: `SUSPENDED_LOGIN_PATH`, `INACTIVE_LOGIN_PATH` y `EXPIRED_LOGIN_PATH`. Si no hay token o el token es inválido, se sigue yendo a `/login` a secas. La sesión rechazada se **ignora**: no se intenta borrar la cookie al renderizar, y el proxy tampoco la borra. El login normal la pisa.
- **AC-6 Avisos del proxy sin loop ni open redirect:** `isSuspendedNotice` se generaliza, por ejemplo a `isLoginNotice(search)`, y solo acepta `suspended=1`, `inactive=1` o `expired=1` (exactamente `"1"`). `decideRoute` no redirige `/login?<aviso>=1` a `/dashboard` aunque el JWT sea válido. `/login` sin aviso, o con otro valor (`inactive=0`, `expired=true`), sigue yendo a `/dashboard`. Las rutas de aviso son constantes y nunca se arman con input del usuario. Si llega un `next` junto al aviso, sigue pasando por `safeNextPath`. `src/proxy.test.ts` agrega casos para los tres avisos, para los valores inválidos y para el recorrido anti-loop (`/dashboard` con JWT válido → `requireSession` → `/login?inactive=1` / `?expired=1` → el proxy lo deja pasar). Además prueba que `/login?expired=1&next=//evil.com` no produce ningún `location` externo. Los tests de 018 que existen siguen pasando.
- **AC-7 Mensajes en /login:** `page.tsx` muestra un `role="alert"` con el mismo estilo que el aviso de suspendida. Con `inactive=1` dice "Tu acceso fue desactivado. Hablá con el dueño de la barbería." y con `expired=1` dice "Tu sesión se cerró porque cambió la contraseña. Ingresá de nuevo.". Los textos son constantes exportadas y se muestra un solo aviso, con prioridad suspended > inactive > expired. El login con credenciales válidas desde esas URLs funciona y deja una sesión nueva válida.
- **AC-8** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `src/lib/session.ts`
- `src/lib/session.test.ts`
- `src/lib/auth.ts`
- `src/proxy.ts`
- `src/proxy.test.ts`
- `src/server/actions/account.ts`
- `src/server/actions/invitations.ts`
- `src/app/(auth)/login/page.tsx`

## Fuera de alcance
- La auth del admin de la plataforma (`src/lib/admin-session.ts`, `src/lib/admin-auth.ts`, `src/server/actions/admin.ts`, `/admin/**`), que va en el job 020.
- Una lista de sesiones o dispositivos, un botón de "cerrar todas las sesiones" y una tabla de sesiones en DB.
- Revocar al desactivar un barbero o al cambiar su rol: eso ya lo resuelve la re-lectura de la DB.
- Rate limit de login, cambios en el flujo de invitaciones (TTL, un solo uso), cambios en `login-form.tsx` o en el action de login, salvo que sea estrictamente necesario.
- Borrar la cookie desde el proxy o desde un Server Component.
- Dependencias o variables de entorno nuevas. Tampoco se cambia el seed.

## Riesgos
- **Auth (hot files):** se tocan `src/lib/auth.ts`, `src/lib/session.ts` y `src/proxy.ts`, y un error acá deja afuera a todos o deja pasar sesiones revocadas. La comparación `iat` contra `passwordChangedAt` tiene que ser a precisión de segundo. Si se compara en milisegundos, la cookie re-emitida al cambiar la contraseña se auto-revoca. La contracara aceptada es que un token emitido en el mismo segundo del cambio, pero antes, sigue valiendo.
- **Cambio de schema:** se agrega una columna nullable con una migración nueva. Es un hot file y requiere un humano.
- **Open redirect / loop:** los avisos tienen que ser rutas constantes, y `next` sigue pasando por `safeNextPath`.
- **Multi-tenant:** un JWT con un `barbershopId` distinto del de la DB se sigue rechazando (ahora con el motivo `inactive`) y no da acceso a datos de otro tenant.
- Dinero: ninguno. Dependencias nuevas: ninguna.
