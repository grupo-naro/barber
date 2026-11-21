ESCALATE

**Motivo:** Las 4 reviews de la ronda 2 dan PASS y los checks están en verde, pero el cambio toca auth/sesiones (`src/lib/auth.ts`, `src/proxy.ts`, `src/lib/session.ts`) y agrega schema más una migración, así que lo tiene que revisar un humano.

## Notas
- **Por qué escala:** son disparadores obligatorios. Se agrega un rol de admin de plataforma que ve y modifica todos los tenants. `getSession`/`requireSession` cambian en `src/lib/auth.ts`, el proxy resuelve `/admin` antes del chequeo de slug, `verifySession` rechaza tokens con `aud`, y hay una migración nueva (`prisma/migrations/20261121171035_platform_admin`). El spec ya preveía escalar este job ("El job corre solo y se escala a un humano").
- **Lo que está bien:**
  - Las reviews de la ronda 2 (code, security, ui, ux) dan `VERDICT: PASS`.
  - Pasan lint, typecheck, test (278 tests), build y booking-smoke.
  - `build.md` tiene evidencia de cada AC (AC-1 a AC-8).
  - Los 41 archivos del diff están dentro del scope.
  - La migración solo hace `CREATE TYPE`, `ADD COLUMN ... DEFAULT` y `CREATE TABLE`, sin DROP ni borrado de datos.
  - `package.json` solo suma el script `admin:create`, sin dependencias nuevas.
  - No hay variables de entorno nuevas.
- **Qué mirar a mano:**
  - La separación de sesiones: el audience `platform-admin` se exige en `verifyAdminSession` y se prohíbe en `verifySession`.
  - Que `requireAdminSession()`/`getAdminSession()` estén en cada página y action de `/admin`.
  - El anti-loop de la suspensión: `/login?suspended=1` más `isSuspendedNotice` en el proxy.
  - El flujo `RESET` en `acceptInvitation`/`getUsableInvitation`: es de un solo uso y pisa el `passwordHash` de un dueño que ya tiene contraseña.
  - Que `scripts/create-admin.ts` imprima la contraseña una sola vez y nunca la loguee.
- **Desvío menor que conviene confirmar:** el borde de `monthRange` se testeó con la lectura correcta para UTC-3. El builder dice que la frase del spec estaba invertida: a las 00:30 del 1 en Buenos Aires ya es el mes nuevo, y en UTC el mes arranca a las 03:00 del 1.
- **Pendientes de seguridad fuera de alcance que documentó el builder** (para jobs futuros):
  1. Después de un RESET o de un cambio de contraseña, los JWT de barbería que ya estaban emitidos siguen vivos. Propuesta: `passwordChangedAt` comparado contra `iat`.
  2. Las sesiones de admin y de barbería se firman con el mismo `SESSION_SECRET`. La separación es solo por audience, cookie y forma del payload. Propuesta: `ADMIN_SESSION_SECRET` cuando se permitan variables de entorno nuevas.
  3. Bug previo: hay un loop de redirects `/login` ↔ `/dashboard` para un usuario inactivo con un JWT vigente. Propuesta: el mismo mecanismo `/login?inactive=1`.
  4. Excluidos explícitamente por el spec: rate limiting de `/admin/login`, 2FA, log de auditoría y recuperación de la contraseña del admin.
- **Otros detalles:**
  - El "dueño" que se edita o resetea es el OWNER más antiguo (`createdAt asc`).
  - Un `id` inexistente en `/admin/barbershops/[id]` muestra el not-found con status 200 por el streaming, igual que en `/dashboard/barbers/[id]`.
