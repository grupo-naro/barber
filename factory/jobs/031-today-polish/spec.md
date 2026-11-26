# Hoy: cliente que queda pegado y detalles de las reviews de 030

**Pedido:** seguimientos del job 030 (ya en `main`), y nada más que esto:
(a) BUG: en "Registrar corte", una búsqueda de cliente por teléfono (350 ms de espera + respuesta) que vuelve después de registrar con éxito escribe el cliente en el borrador ya vacío, y el corte siguiente muestra al cliente anterior y se guarda sin cliente. Tiene que quedar limpio en cualquier orden, incluida la respuesta que ya salió hacia el servidor; y fijate si pasa lo mismo al salir de Hoy. Con recorrido en scripts/panel-check.mjs que falle sin el arreglo (toques a 0, 150 y 250 ms después de escribir el teléfono).
(b) El nombre del barbero en la fila de la agenda del dueño no se corta en 402 ni en 360 con nombres normales (ej. "Lucas Fernández"); con nombres larguísimos puede recortar sin desbordar, y el nombre del cliente sigue legible.
(c) El barbero no ve su propio nombre repetido en cada fila pendiente suya; el diseño define las etiquetas, resolvé con el cambio mínimo.
(d) A 360x640, al abrir "Cliente (opcional)" los campos quedan a la vista dentro de la hoja (respetando prefers-reduced-motion).
(e) Al volver a Hoy desde otra pestaña del panel (o del navegador), la línea de ahora muestra la hora actual sin esperar hasta 60 s.
(f) Horas con tabular-nums.
(g) panel-check: solo acepta localhost en --base y en la base de datos, tokens por variables de entorno en vez de argv, y borra el perfil temporal de Chrome también con el timeout global.
(h) use-sheet-action: `busy` no queda en true en la rama de salida de la pantalla.
NO incluir: recordar el medio de pago (no lo pidió el dueño), tandas 2 y 3, ni el 032.

Diseño que manda: `docs/superpowers/specs/2026-11-24-panel-movil-design.md`. Bug reproducido: `factory/jobs/030-mobile-panel-today/decision.md`.

## Contexto

**Qué existe hoy (verificado en el código; `today/` es `src/app/(dashboard)/dashboard/today/`):**
- `today/walk-in-sheet.tsx`: `onPhoneChange` arma el `timer` (350 ms) y compara la respuesta contra `latestPhone`. `onSuccess` vacía el borrador pero no toca `timer`, `latestPhone` ni `searching`. El cleanup de salida existe, pero es `useEffect` (pasivo), mientras que `TodayBoard` vacía el borrador en un cleanup de `useLayoutEffect`: entre los dos podría entrar una respuesta o vencer el timer.
- El cliente de Next encola las Server Actions: una búsqueda disparada durante el envío sale recién cuando termina `createWalkIn`, así que su respuesta llega después del éxito. Coincide con que el bug aparezca a 0, 150 y 250 ms y no a 450 ms.
- `today/today-board.tsx`: `useNow`, `AppointmentRow` (etiqueta con `max-w-28 truncate`; hora en Anton sin `tabular-nums`) y el `key={visit}` que remonta las hojas al salir. La línea de ahora, `appointment-sheet.tsx` y `records-sheet.tsx` **ya** llevan `tabular-nums`: no hace falta tocarlos.
- `src/lib/today-board.ts`: `appointmentTag({ status, barber })`, con un solo uso (`AppointmentRow`) y su test. El barbero solo recibe turnos propios y sin asignar (`appointmentBarberFilter` en `src/server/queries/records.ts`).
- `src/components/panel/use-sheet-action.ts`: en la rama `!alive.current` vuelve sin soltar `busy`.
- `scripts/panel-check.mjs`: secciones con `section(nombre, …)` y `--only`; `__skew` corre `Date.now()`; `page.net({ latency })`; fixture con clientes `chk-cus-N`, de teléfono `5491100000` + `100+N`. Para copiar el estilo: "Borrador", "Salir con un envío en curso", "Medidas de Hoy".
- La Anton que sirve `next/font` **no trae la característica `tnum`** (revisado en los woff2): `tabular-nums` no cambia el ancho de sus cifras. AC-5c pide la propiedad, no anchos iguales.

**Docs de Next 16 a leer** (`node_modules/next/dist/docs/01-app/`): `02-guides/preserving-ui-state.md` (las rutas se ocultan con `<Activity>`, no se desmontan: efectos, layout effects y estado al ocultar y al volver).

## Criterios de aceptación

- **AC-1 Cliente que no queda pegado.**
  - a) La regla "qué respuesta vale" (espera, búsqueda más nueva, cancelación) queda en `src/lib/latest-lookup.ts`, sin React, con test de Vitest y timers falsos: cancelar durante la espera no llama a la búsqueda; cancelar con la búsqueda ya enviada descarta su resultado; una búsqueda nueva descarta la anterior aunque responda después; una respuesta vieja se descarta aunque después se vuelva a buscar el **mismo** teléfono; si la búsqueda falla, entrega `null` como hoy; después de cancelar se puede volver a buscar.
  - b) Al registrar con éxito se cancela la búsqueda (pendiente o ya enviada) y "Buscando cliente…" no queda prendido. Vale también si el teléfono se escribió o cambió mientras decía "Registrando…".
  - c) Al salir de Hoy (con la hoja abierta y la búsqueda en espera o enviada, o con un envío en curso) y volver, el borrador está vacío y sigue vacío cuando llega la respuesta. La cancelación va en la misma fase que el vaciado del borrador (layout effect).
  - d) Si registrar falla, nada se cancela: quedan los datos, y la búsqueda en curso completa el cliente como hoy. Cerrar la hoja sin registrar tampoco la cancela.
  - e) Sección nueva en `panel-check`, "Cliente que llega tarde", a 402×874 y con un cliente existente: elegir servicio, escribir el teléfono y tocar Registrar a los 0, 150 y 250 ms, con latencia 0 y con 400 ms. El primer corte queda con su `customerId`. Al reabrir, y otra vez 1,5 s después: teléfono y nombre vacíos, sin cliente en "Cliente (opcional)", sin "Ver ficha" ni "Buscando cliente…". El corte siguiente se guarda con `customerId` nulo. Un recorrido más cubre AC-1c (salir a los 0, 150, 250 y 450 ms).
  - f) La sección **falla sin el arreglo**: en `build.md` va la salida con el código de `main` (con `--only`, tras `pnpm build`) y con el arreglo. También se anota si salir de Hoy se reprodujo o no sin el arreglo; si no se reproduce, alcanza con que ese recorrido pase.

- **AC-2 Nombre del barbero en la agenda del dueño.** Verificado en `panel-check` a 402×874 y 360×640, cambiando y después restaurando el nombre del barbero en la base descartable.
  - a) Con "Lucas Fernández", "Martín Gómez" y "Santiago Rodríguez", el nombre se ve completo en una fila pendiente (`scrollWidth <= clientWidth`, y `scrollHeight <= clientHeight` si ocupa dos líneas), y el cliente "Tomás Vera", puesto en esa misma fila, también.
  - b) En una fila "Listo" del dueño (servicio · barbero) se recorta primero el servicio: esos tres nombres se ven completos.
  - c) Con un barbero de 60 caracteres y el cliente de 60: sin desborde horizontal, y el espacio del nombre del cliente mide 96 px o más a 360.
  - d) Siguen viéndose por lo menos 4 turnos enteros a 402×874, y "Registrar corte" sin scroll a 360×640 (las verificaciones que ya existen).

- **AC-3 El barbero no ve su nombre repetido.**
  - a) En una fila pendiente o confirmada **suya**, el barbero no ve etiqueta: ni su nombre ni un texto nuevo (el diseño no define otra). "Sin asignar", "Listo", "No vino" y "Cancelado" no cambian.
  - b) El dueño sigue viendo el nombre del barbero en todas las filas asignadas, también en las que atiende él.
  - c) La regla va en `appointmentTag` (o al lado, en `src/lib/today-board.ts`), con tests para: barbero con turno propio, barbero con turno sin asignar, barbero con turno propio terminado, dueño con turno propio y dueño con turno de otro.
  - d) `panel-check`, como barbero: la fila `chk-apt-3` no contiene su nombre y `chk-apt-2` dice "Sin asignar".

- **AC-4 "Cliente (opcional)" a la vista.** Verificado en `panel-check` a 360×640 con la hoja scrolleada arriba.
  - a) Después de tocar "Cliente (opcional)", los campos Teléfono y Nombre quedan enteros dentro del área visible del contenido de la hoja (debajo del título y por encima del botón fijo) en 500 ms o menos.
  - b) Con `prefers-reduced-motion: reduce` el salto es inmediato (a los dos cuadros ya está en su lugar). Ojo: `scroll-behavior: auto !important` de `panel.css` no frena un `behavior: "smooth"` pedido por JS.
  - c) No enfoca ningún campo (no abre el teclado), no mueve el scroll de la página de atrás, y no scrollea al plegar ni al reabrir una hoja cuyo borrador ya tenía "Cliente" abierto.

- **AC-5 Hora al día.** Verificado en `panel-check`.
  - a) Desde Hoy, ir a Caja por la barra, correr `__skew` y volver por la barra; y otra vez volviendo con Atrás. La línea de ahora muestra la hora corrida en 1 s o menos y queda en la posición que corresponde a esa hora (el corrimiento de al menos un caso tiene que cambiarla de lugar cuando el día lo permite).
  - b) Al volver de otra pestaña del navegador (`visibilitychange`) también se actualiza en 1 s o menos. Sigue avanzando cada minuto y sin error de hidratación en consola; al cargar arranca de `serverNow`.
  - c) La hora de cada fila de la agenda y la de la línea de ahora tienen `font-variant-numeric: tabular-nums` computado. No se cambia la fuente.

- **AC-6 `panel-check` más seguro.** Verificado corriendo el script.
  - a) `--base` solo acepta `http:`/`https:` con host exacto `localhost`, `127.0.0.1` o `[::1]`. Rechaza con salida 1, **antes** de abrir Chrome o conectarse a la base: `https://example.com`, `http://localhost.example.com`, `http://localhost@example.com`, `http://0.0.0.0:3001` y una URL inválida.
  - b) El host efectivo de la base (el que va a usar `pg`, también con `?host=` en la URL) tiene que ser uno de los mismos tres; si no, salida 1 sin conectarse. Se mantiene el requisito `barber_job_`.
  - c) Los tokens se leen de `PANEL_CHECK_OWNER_TOKEN` y `PANEL_CHECK_BARBER_TOKEN`. `--owner` y `--barber` dejan de existir (pasarlos sale con 1 y sin imprimir su valor). Si falta una variable o el token está mal formado, salida 1 nombrando la variable y sin imprimir ningún pedazo del token. Chrome se lanza sin esas variables en su entorno. El comentario de uso queda al día.
  - d) Con el timeout global, con Ctrl+C y con un error temprano, el perfil `panel-check-*` de esa corrida se borra y no queda ningún Chrome propio vivo. El timeout se puede achicar con `PANEL_CHECK_TIMEOUT_MS` (para probarlo); en `build.md` va la evidencia de una corrida cortada por timeout, con salida 1.
  - e) La corrida completa contra `pnpm build` + `pnpm start` sale con 0. Si con las secciones nuevas no entra en 12 minutos, se sube el valor por defecto.

- **AC-7 `useSheetAction`.**
  - a) En la rama `!alive.current`, `busy` vuelve a `false` y el resultado se sigue avisando por toast (se verifica leyendo el código).
  - b) Las secciones "Doble toque y hoja bloqueada", "Salir con un envío en curso" y "Sin conexión" siguen pasando: un solo envío y sin reintentos.

- **AC-8** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Verificación (para el builder)

- Solo la base propia del worktree (`barber_job_031`, la de su `.env`). **Nunca** la base `barber` del usuario: confirmar `DATABASE_URL` antes de cada seed o `panel-check`.
- Chrome por DevTools Protocol con `Emulation.setDeviceMetricsOverride` (en Windows `--window-size` no baja de unos 500 px), con perfil temporal y puerto propios, y siempre con timeout. Matar solo el proceso propio.
- No tocar los procesos de los puertos 3000 y 8080. Usar el puerto del slot y apagarlo al terminar.
- Tokens con `signSession` (`src/lib/session.ts`), el `SESSION_SECRET` del worktree y usuarios del seed, por entorno. Ni tokens ni capturas se commitean.
- Node 24 trae `WebSocket`; sin dependencias nuevas. Restaurar lo que cambie cada recorrido (nombres de barbero incluidos), también si falla.

## Target Files (Scope)
- `src/app/(dashboard)/dashboard/today/today-board.tsx`
- `src/app/(dashboard)/dashboard/today/walk-in-sheet.tsx`
- `src/components/panel/use-sheet-action.ts`
- `src/lib/today-board.ts`
- `src/lib/today-board.test.ts`
- `src/lib/latest-lookup.ts`
- `src/lib/latest-lookup.test.ts`
- `scripts/panel-check.mjs`

## Fuera de alcance
- Recordar el medio de pago más usado, tandas 2 y 3 del panel, y el 032 (lecturas con el panel bloqueado por cobro).
- `src/server/actions/**`, `src/server/queries/**`, schema, dependencias, `src/components/ui/**`, `src/components/panel/sheet.tsx`, `panel.css` y los demás archivos de Hoy.
- Cambiar textos o etiquetas del diseño, agregar "Tuyo" o "Pendiente", o cambiar la altura o el orden de las filas más de lo que pide AC-2.
- Cambiar la fuente de las horas o armar cajas por cifra para igualar anchos (Anton no trae `tnum`).
- Idempotencia de `createWalkIn`, abortar la búsqueda en el servidor, o bloquear los campos mientras guarda.

## Riesgos
- **Dinero:** `use-sheet-action.ts` evita el doble envío. Soltar `busy` va **solo** en la rama de salida de la pantalla; la rama de éxito sigue bloqueada hasta `reset`.
- **Datos de un cliente:** el borrador tiene teléfono y nombre; ningún orden puede dejarlos en el corte siguiente ni al volver a Hoy. No cruza barberías: `lookupCustomer` no cambia.
- **Script con sesión:** `panel-check` borra y escribe datos en la base que le den; las guardas de AC-6 tienen que correr antes de cualquier conexión.
- Sin cambios de auth, schema ni dependencias, y sin hot files.
