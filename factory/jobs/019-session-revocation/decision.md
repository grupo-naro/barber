ESCALATE

**Motivo:** 4/4 PASS y AC-1..AC-8 con evidencia, pero toca auth (`src/lib/auth.ts`, `src/proxy.ts`) y agrega una migración de schema (`User.passwordChangedAt`), que son hot files y requieren un humano.

## Notas
- El diff toca 10 archivos y todos están dentro del scope del spec. No hay dependencias ni variables de entorno nuevas, no se borran datos y la auth del admin no se tocó.
- La migración `20261121210000_session_revocation` es solo `ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3)`, nullable. El orquestador verificó que las 7 migraciones aplican limpias en una DB vacía y que no hay drift contra el schema. El cambio en `schema.prisma` es esa columna más el realineado del bloque `User`.
- Hay dos cosas del build que conviene saber:
  - La carpeta de la migración se renombró a mano para que quede después de `split_opening_hours`.
  - En la DB del worktree se corrigió a mano una columna que había agregado por error a `PlatformAdmin`, con `DROP COLUMN` y actualizando el checksum. El SQL commiteado ya está limpio.
- Puntos a revisar en auth:
  - En `isSessionRevoked`, la comparación es a precisión de segundo y falla cerrada: si hay cambio registrado y el token no trae `iat`, lo revoca.
  - El orden de rechazo en `lookupSession` es inactive, suspended, expired, todo en la misma query.
  - `requireSession` redirige a rutas constantes.
  - `isLoginNotice` acepta solo el valor exacto `"1"` y el `next` sigue pasando por `safeNextPath`.
  - `changePassword` re-emite la cookie con `createSession` después de un `count === 1`.
- Ventana aceptada por el spec: un token emitido en el mismo segundo del cambio, pero antes, sigue siendo válido.
- Nits abiertos de las reviews (ninguno bloquea):
  - [code/security] `src/proxy.ts:50`: `isSuspendedNotice` quedó exportada solo para los tests de 018 y es código muerto en runtime. Conviene migrar esos tests a `isLoginNotice` y borrarla.
  - [code] `src/lib/session.test.ts`: usa `payload!.issuedAt` (non-null assertion). Mejor `expect(payload).not.toBeNull()` y después `payload?.issuedAt`.
  - [code] Los textos de aviso quedan repartidos: `INACTIVE_MESSAGE` y `EXPIRED_MESSAGE` están en `auth.ts`, y `SUSPENDED_MESSAGE` en `platform-admin`.
  - [security] `src/lib/session.ts:89`: si se quiere cerrar la ventana del mismo segundo, en un job futuro se puede pasar a un `sessionVersion` en el JWT.
  - [security] `src/server/actions/account.ts:37`: `passwordChangedAt` sale del reloj del proceso de JS. Si se pasa a usar `now()` de Postgres, la garantía `iat >= changedAt` pasa a depender del clock skew.
  - [ui/ux] `src/app/(auth)/login/page.tsx:20`: el aviso `expired` usa el estilo destructivo (rojo). Podría ir con un estilo neutro, aunque AC-7 pide el mismo estilo que el de suspendida.
  - [ux] `src/server/actions/account.ts:43`: el mensaje de éxito no avisa que se cerró la sesión en los otros dispositivos.
  - [ux] `INACTIVE_MESSAGE`: opcionalmente "Tu acceso está desactivado" suena menos tajante.
- La prueba manual con curl de AC-4 solo está documentada en `build.md`: la review de code no la re-verificó.
