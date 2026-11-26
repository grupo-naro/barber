# Build: 031-today-polish
**Rama:** factory/031-today-polish · **Commit:** bd995c7 · **Worktree:** .worktrees/031-today-polish

## Qué cambió
- `src/lib/latest-lookup.ts` (nuevo): espera + "solo vale la última búsqueda" + cancelar. Cada búsqueda tiene un número; no compara el texto.
- `src/lib/latest-lookup.test.ts` (nuevo): 10 tests con timers falsos.
- `src/app/(dashboard)/dashboard/today/walk-in-sheet.tsx`: usa `latest-lookup`; cancela al registrar con éxito y, en layout effect, al salir de Hoy; después de un éxito no acepta más cambios hasta que la hoja termina de cerrarse; deja "Cliente" a la vista al abrirlo.
- `src/app/(dashboard)/dashboard/today/today-board.tsx`: nombre del barbero en hasta dos líneas; en "Listo" se recorta primero el servicio; hora al día al volver; `tabular-nums` en la hora de la fila.
- `src/lib/today-board.ts` y `.test.ts`: `appointmentTag` recibe quién mira y devuelve `null` en lo propio del barbero.
- `src/components/panel/use-sheet-action.ts`: `busy.current = false` en la rama `!alive.current`. La rama de éxito no cambió.
- `scripts/panel-check.mjs`: guardas, tokens por entorno, limpieza y cinco secciones nuevas.

## El bug (a), antes y después
Mismo `panel-check`, `pnpm build` + `pnpm start` en 3001, base `barber_job_031`.

**Con `src/` de `main`** (`git checkout main -- src`, build, `--only "llega tarde"`): **salida 1, 57 pasan y 27 fallan.**
```
  ✗ registrar a los 0 ms, red 0 ms: al reabrir, sin cliente → {"phone":"","name":null,"toggle":"Cliente · Juan Acosta","extra":["Ver ficha","Juan Acosta"]}
  ✗ registrar a los 0 ms, red 0 ms: 1,5 s después, sin cliente
  (igual con 150 y 250 ms, y con red 400 ms: 12 fallas)
  ✗ teléfono escrito al guardar (+0 ms y +500 ms): al reabrir / 1,5 s después (4 fallas)
  ✗ teléfono escrito al cerrarse: al reabrir → {"phone":"54911000001012", …} (2 fallas, y corta la sección)
  ✗ salir a los 0/150/250/450 ms con un envío en curso, ida y vuelta rápida: … (8 fallas)
57 verificaciones pasaron, 27 fallaron.
```
**Con el arreglo:** `86 verificaciones pasaron, 0 fallaron.` **Salida 0.**

- Salir de Hoy (hasta ver Caja) **no** se reprodujo sin el arreglo: 0, 150, 250 y 450 ms, con y sin envío, pasan en `main`.
- Sí se reprodujo ir y volver enseguida (Atrás y Adelante) con un envío en curso. Ahí la hoja sigue a la vista hasta que el envío termina y Hoy no llega a ocultarse.
- Caso extra que encontré: una tecla que entra mientras la hoja se cierra dejaba el teléfono en el borrador. También queda cubierto.

## Criterios de aceptación
`panel-check` completo: `1027 verificaciones pasaron, 0 fallaron.`, **salida 0**, 373 s.

| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1a | ✅ | `latest-lookup.test.ts`, 10 tests: los seis casos del spec y cuatro más. |
| AC-1b | ✅ | "Cliente que llega tarde": 0/150/250 ms × red 0/400, y teléfono escrito durante "Registrando…" (0 y 500 ms). |
| AC-1c | ✅ | "Cliente que llega tarde al salir": 12 recorridos; layout effect en el código. |
| AC-1d | ✅ | Mismo recorrido: con error del servidor la búsqueda completa el cliente y queda el teléfono; cerrar sin registrar no cancela. |
| AC-1e | ✅ | Primer corte con su `customerId`; hoja limpia al reabrir y 1,5 s después; corte siguiente con `customerId` nulo, leído de la base. |
| AC-1f | ✅ | Arriba. |
| AC-2a, b | ✅ | "Nombres en la agenda", los tres nombres a 402 y 360. En `main`: `"Lucas Fernández" → 114 px en 112` y `"Santiago Rodríguez" → 131 en 112`. |
| AC-2c | ✅ | 60 y 60 caracteres: sin desborde y 96 px o más para el cliente. |
| AC-2d | ✅ | 402×874: 8 turnos enteros con cada nombre; 360×640: "Registrar corte" entero y sin scroll. |
| AC-3a–c | ✅ | `today-board.test.ts`, los cinco casos (pendiente y confirmado). |
| AC-3d | ✅ | Como barbero: `chk-apt-3` sin su nombre y sin otra etiqueta; `chk-apt-2` "Sin asignar"; `chk-apt-0` "Listo". El dueño ve el nombre del barbero y el propio. |
| AC-4a–c | ✅ | "Cliente a la vista" a 360×640: 22 pasan. Con movimiento, en 500 ms o menos y ahí queda; con movimiento reducido, a los dos cuadros. Sin foco, sin mover la página, y sin scroll al plegar ni al reabrir. Mira también las etiquetas de los campos. |
| AC-5a | ✅ | "Hora al día": volver por la barra `22:12 → 23:12` (posición 2 → 5) y con Atrás `00:19` (9), en 1 s o menos. En `main` quedaba en `22:03`, posición 2. |
| AC-5b | ✅ | `visibilitychange`; sigue avanzando después de volver y en "Medidas de Hoy"; sin errores en consola. El evento se disparó desde el script, no con una segunda pestaña real. |
| AC-5c | ✅ | `font-variant-numeric: tabular-nums` computado en todas las filas y en la línea; siguen en Anton. |
| AC-6a | ✅ | Los cinco del spec, más `http://`, `file:` y `http://user:pw@localhost`: `Me niego a correr: --base tiene que ser http(s)://localhost, 127.0.0.1 o [::1].`, salida 1, 0 perfiles creados. `localhost`, `127.0.0.1` y `[::1]` sí corren. |
| AC-6b | ✅ | Mira `client.host` y `client.database` de `pg` sin conectar. `…@example.com/…`, `?host=example.com`, `?host=/tmp`, `?host=localhost,example.com` y `PGHOST=example.com`: `Me niego a correr: la base no está en esta máquina (localhost).`, salida 1. Base `barber`: se niega. |
| AC-6c | ✅ | `--owner X`, `--barber=X` y posicional: `Argumentos inválidos…`, salida 1 y sin el valor. Sin variable: `Falta PANEL_CHECK_OWNER_TOKEN.` Mal formado: `… no es un token de sesión bien formado.`, sin ningún pedazo. Entorno de Chrome revisado interceptando `spawn`: sin las dos variables (ni `SESSION_SECRET`, `DATABASE_URL` ni `POSTGRES_PASSWORD`). |
| AC-6d | ✅ | Abajo. |
| AC-6e | ✅ | Salida 0 en 373 s: entra en 12 minutos, el valor por defecto no cambió. |
| AC-7a | ✅ | Código: se libera solo en la rama de salida; el `toast` sigue. |
| AC-7b | ✅ | "Doble toque y hoja bloqueada", "Salir con un envío en curso" y "Sin conexión" pasan. |
| AC-8 | ✅ | Ver Checks. |

### AC-6d: corridas cortadas
Después de cada una se contaron los perfiles `panel-check-*` y los `chrome.exe` que los usan, y se leyó el nombre del barbero en la base. Durante la corrida el mismo conteo daba 1 perfil y 14 procesos.
```
PANEL_CHECK_TIMEOUT_MS=3000 … --only Nombres
  ✓ 402 con "Santiago Rodríguez": se ven 8 turnos enteros
Timeout global (3 s).
salida 1 · perfiles: 0 · chrome propios: 0 · barbero: Martín Gómez
PANEL_CHECK_TIMEOUT_MS=300  → Timeout global (0.3 s). salida 1 · 0 · 0
Ctrl+C real (GenerateConsoleCtrlEvent) → Cortado (SIGINT).   salida 1 · 0 · 0 · barbero: Martín Gómez
Ctrl+Break                             → Cortado (SIGBREAK). salida 1 · 0 · 0 · barbero: Martín Gómez
Base caída (puerto 5999)               → ECONNREFUSED.       salida 1 · 0 · 0
CHROME_PATH inexistente                → No pude abrir Chrome. salida 1 · 0 · 0
```

## Decisiones
- El nombre del barbero pasa a dos líneas dentro de los mismos 112 px, en lugar de ensanchar la etiqueta: el cliente conserva el espacio de hoy y la fila no crece.
- Un nombre de más de dos líneas se corta en palabra entera, pero **sin "…"**: Chrome no dibuja los puntos del `line-clamp` con texto alineado a la derecha.
- El scroll de "Cliente" mueve solo el contenido de la hoja y lo encuentra por `data-drawer-content`, el atributo que pone Base UI (`sheet.tsx` está fuera de scope). Si una versión futura lo cambia, `panel-check` falla.

## Encontrado y no tocado (existe igual en `main`)
Tocar "Registrar corte" hasta unos 120 ms después de que la hoja empezó a cerrarse por un éxito la reabre vacía pero trabada en "Registrando…": no se cierra y hay que recargar. Lo corrí también con `src/` de `main`, con el mismo resultado (0, 60 y 120 ms; a 200 ms ya no). No duplica cortes ni muestra datos del cliente. La causa es que el cierre no termina y `reset` no se llama. El spec pide que la rama de éxito siga bloqueada hasta `reset`, así que queda para otro job.

## No verificado
- Teléfonos reales: teclado y toque se emularon en Chrome.
- Segunda pestaña real del navegador (AC-5b).
- La limpieza en Linux y macOS (grupo de procesos con `detached`): solo se corrió en Windows.
- Un `kill -9` del script no puede limpiar nada.

## Checks
lint ✅ · typecheck ✅ · test ✅ (536) · build ✅ · booking-smoke ✅ (0) · cash-smoke ✅ (0)

Los 8 archivos del diff están en Target Files. No se crearon otras bases. Puerto 3001 y Chrome propio cerrados.
