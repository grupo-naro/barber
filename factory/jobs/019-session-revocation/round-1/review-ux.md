VERDICT: PASS

## Hallazgos
- [nit] `src/app/(auth)/login/page.tsx:20`: el aviso "expired" usa el estilo destructivo (rojo), igual que suspendida/inactiva. Es un cierre de sesión esperado y no un error, así que se siente más alarmante de lo necesario → usar un estilo neutro o informativo para `expired` (por ejemplo `bg-muted text-foreground`), manteniendo `role="alert"`. No bloquea: la spec (AC-7) pide el mismo estilo.
- [nit] `src/server/actions/account.ts:43`: el éxito dice "Listo, cambiamos tu contraseña." y no aclara que se cerró la sesión en los otros dispositivos. La persona sigue logueada, pero no tiene confirmación de que los demás quedaron afuera → "Listo, cambiamos tu contraseña. Cerramos tu sesión en los otros dispositivos." Está fuera de los AC, por eso es nit.
- [nit] `src/lib/auth.ts:45`: `INACTIVE_MESSAGE` dice "Tu acceso fue desactivado. Hablá con el dueño de la barbería." Es claro, con voseo y con un próximo paso. Opcional: "Tu acceso está desactivado" suena un poco menos tajante.
- [nit] `SUSPENDED_MESSAGE` ("Contactá al administrador") no está en el diff. Queda como referencia: es consistente con los otros dos avisos.

## Revisado
Sin flujos de reserva ni de corte walk-in: no hay cambio ahí. Los tres avisos de /login (suspended, inactive, expired) están en español rioplatense, dicen qué hacer, tienen `role="alert"` y un solo aviso a la vez con prioridad definida. El formulario de login sigue debajo y funciona desde esas URLs. Cambiar la contraseña propia cuesta 3 campos + 1 toque, sin pasos nuevos; el dispositivo actual sigue logueado (cookie re-emitida) y los otros caen en `/login?expired=1` sin loop. Solo texto, sin cambios de layout, táctil ni teclado.
