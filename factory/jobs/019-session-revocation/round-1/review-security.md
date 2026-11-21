VERDICT: PASS

## Hallazgos
- [nit] `src/lib/session.ts:89` (`isSessionRevoked`): ventana aceptada por el spec: un token emitido en el mismo segundo del cambio, pero antes, sigue valiendo. Está documentada en el JSDoc. Si en algún momento se quiere cerrar, la salida es guardar un `sessionVersion` en el JWT en lugar de comparar timestamps (job futuro, no bloquea).
- [nit] `src/proxy.ts:50` (`isSuspendedNotice`): ya no la usa el proxy y quedó exportada solo para los tests de 018. Conviene migrar esos tests a `isLoginNotice` y borrarla para que no quede un segundo criterio de "aviso" que alguien pueda reusar por error.
- [nit] `src/server/actions/account.ts:37`: `passwordChangedAt: new Date()` y el `iat` de `createSession` salen del reloj del mismo proceso, así que `iat >= floor(changedAt/1000)` está garantizado. Si en algún momento el timestamp pasa a tomarse de la DB (`now()` de Postgres), esa garantía depende del clock skew. Dejar el comentario o mantenerlo en JS.

Verificado sin problemas:
- La comparación falla cerrada: `passwordChangedAt` null → acepta; si falta el `iat` o no es finito y hay cambio registrado → rechaza. `iat` lo firma el servidor con HS256, así que no se puede falsificar uno futuro. Usa `iat < floor(ms/1000)` sin bypass, y está testeado con x.000/x.999, el segundo anterior y el posterior.
- `passwordChangedAt` se escribe en el mismo `updateMany` que el hash en `changePassword` y en `acceptInvitation` (INVITE y RESET). Con grep revisé las demás escrituras de `passwordHash`. Las de `admin.ts:141` y `barbers.ts:74` son creates con `null`. `seed.ts` y `scripts/cash-smoke.ts` son creates de usuarios nuevos, sin sesiones previas. `create-admin.ts` es `PlatformAdmin` y queda fuera de alcance. No hay otro camino que setee una contraseña sin marcar el cambio.
- Re-emisión en el dispositivo A: se hace solo después de `count === 1`, con `id`, `barbershopId` y `role` leídos de la DB (filtrados por el `barbershopId` de la sesión). La cookie usa `sessionCookieOptions` (`httpOnly`/`secure`/`sameSite`), sin cambios.
- `lookupSession`: usa la misma única query, a la que se suma `passwordChangedAt`. No agrega queries por request. Un JWT con otro `barbershopId` sigue rechazado (ahora con `inactive`) y el orden inactive → suspended → expired se respeta.
- Los avisos son rutas constantes (`REJECTION_PATH`). `isLoginNotice` exige exactamente `"1"`. `/login?<aviso>=1` con sesión válida solo renderiza el login con el aviso y no da acceso a nada. El `next` sigue pasando por `safeNextPath`, en el proxy y en el action de login. No hay loop ni open redirect, y la cookie no se borra al renderizar.
- La auth del admin no se tocó.

## Revisado
Revisé el diff completo de 10 archivos (schema/migración, session, auth, proxy, account, invitations, la página de login y los tests), más un grep de todas las escrituras de `passwordHash` y el manejo de `next` en el login.
