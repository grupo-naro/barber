VERDICT: PASS

## Hallazgos
- [nit] `walk-in-sheet.tsx` (onClick de "Cliente"): `justOpened.current = !draft.customerOpen` se arma antes de `set(...)`. Si `update` descarta el cambio (después de un éxito, con la hoja cerrándose), la marca queda en true. Sin efecto práctico: la hoja se vuelve a montar o `customerOpen` no cambia. Se puede mover la marca dentro del `update`, si se quiere.
- [nit] `today-board.tsx` (`useNow`): `onVisible()` también corre al montar. Hace un `setNow(Date.now())` extra tras hidratar. Es inocuo, porque ocurre en un efecto y no durante el render, y el valor de `serverNow` se usa hasta ese momento.
- [nit] Una segunda hoja nueva, tras salir y volver a Hoy, puede enviar mientras el envío viejo sigue en curso, porque el `busy` del `useSheetAction` viejo es de otra instancia. Es el diseño de 030 (el resultado viejo avisa solo por toast) y el borrador nuevo está vacío, así que no mezcla datos. Sin acción.

## Recorrido de órdenes (búsqueda × envío)
Reglas del código: `cancel()` hace `clearTimeout` y `current++`. La respuesta solo entra si `id === current`. `confirmed.current !== null` bloquea todo `update`. En cada caso la respuesta tardía se descarta o termina en un borrador que ya se va a vaciar.

- **Búsqueda pendiente (en espera de 350 ms) + éxito:** `onSuccess` cancela el timer, así que no sale ninguna búsqueda. `searching` queda en false. OK.
- **Búsqueda en vuelo (encolada detrás de `createWalkIn`) + éxito:** `current++` descarta su resultado cuando llega. Como después del éxito `confirmed` bloquea cualquier `set`, la respuesta no puede escribir en el borrador. OK.
- **Búsqueda resuelta antes del éxito:** escribe el cliente en el borrador, y `onSuccess` lo vacía con `EMPTY_DRAFT`. OK.
- **Teléfono tipeado o cambiado mientras dice "Registrando…":** `confirmed` sigue en null, así que arma una búsqueda. El éxito la cancela, sea pendiente o en vuelo. OK.
- **Tecla mientras la hoja se cierra después del éxito:** `onPhoneChange` y `update` salen por `confirmed`. `onClosed` lo pone en null recién al terminar el cierre. OK.
- **Envío con error:** no se cancela nada. La búsqueda completa el cliente, el borrador y el error quedan. Cerrar sin registrar tampoco cancela. OK.
- **Salir de Hoy con búsqueda pendiente o en vuelo:** el layout effect de `WalkInSheet` cancela en la misma fase en que `TodayBoard` vacía el borrador y sube `visit`. Entre ambas cosas no puede entrar ninguna respuesta. `key={visit}` remonta la hoja, así que `searching` y `lookup` nacen nuevos. La instancia vieja ya está cancelada. OK.
- **Salir con un envío en curso:** el resultado llega con `alive` en false, así que suelta `busy` y avisa por toast. No llama a `onSuccess` ni toca el borrador nuevo. OK (AC-7a).
- **Éxito con la pantalla visible:** la rama de éxito sigue sin soltar `busy` hasta `reset` (`onClosed`). Un error sí lo suelta. OK.
- **Falla de la búsqueda:** `latest-lookup` entrega `null` solo si `id === current`. Hasta un `lookup` que lanza de forma síncrona queda dentro del `try`. OK.
- **Volver a buscar el mismo teléfono:** el número de búsqueda es nuevo, así que la respuesta vieja no se confunde con la nueva. OK.

No encontré carrera sin cubrir. La única conducta rara es la ya documentada y preexistente (reabrir a menos de 120 ms del cierre), que queda fuera del scope.

## Otros puntos
- **Scope:** los 8 archivos del diff están dentro de Target Files.
- **Código:** sin `any`, `as` ni `!` nuevos. Sin código muerto. La regla de lookup es pura y tiene test. `appointmentTag` tiene tests de los cinco casos de AC-3c.
- **panel-check:** las guardas (`readBase`, `readDatabase`, `readToken`) corren antes de Chrome y de conectarse a la base. No imprimen el valor recibido. El entorno de Chrome se filtra. `cleanup` es síncrono y corre en `exit`. El timeout y las señales pasan por `stop` y deshacen el nombre del barbero. Leí el script pero no lo corrí.
- **No corrí `build`**, como se pidió. Confío en `build.md` para el `panel-check` completo (1027 verificaciones, salida 0) y para el contraste contra `main`.

## Revisado
lint ✅ · typecheck ✅ · test ✅ (536) · build (no corrido, por pedido) · scope ✅ · AC-1..AC-8 ✅ por lectura de código. AC-1e/f, AC-2, AC-4, AC-5 y AC-6d se apoyan en la evidencia de `build.md`, no en una corrida mía.
