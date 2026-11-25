# Panel móvil, tanda 1: base y Hoy

**Pedido:** "Panel móvil, tanda 1: base y Hoy". El diseño y el plan ya están aprobados por el dueño del producto; no se reabren decisiones.

- **Diseño (manda):** `docs/superpowers/specs/2026-11-24-panel-movil-design.md`. Si una maqueta de `docs/superpowers/specs/2026-11-24-panel-movil/*.html` lo contradice, vale el documento.
- **Plan (se sigue tarea por tarea):** `docs/superpowers/plans/2026-11-24-panel-movil-tanda-1.md`. Interfaces, tests, pasos y mensajes de commit salen de ahí. Este spec fija qué se acepta, corrige el plan donde no coincide con el código (ver "Diferencias con el plan") y suma lo que el diseño pide y el plan no cubre (marcado **[+]**).

## Contexto

**Qué existe hoy (verificado en el código):**
- `src/app/(dashboard)/layout.tsx`: encabezado con sesión (`SessionHeader`), avisos `GRACE`/plan, `DashboardNav` y `<main>` con el ancho y el padding. `dashboard/layout.tsx` envuelve todo `/dashboard/*` en `PanelGate`; "Mi cuenta" vive aparte, en `(account)/dashboard/account`, para quedar fuera del bloqueo.
- Hoy: `dashboard/today/page.tsx` ("Cuaderno del día") con `WalkInForm`, `CompleteAppointmentForm` y `AppointmentStatusButtons`. Datos: `src/server/queries/records.ts` (`listTodayAppointments` ya ordena por `startsAt`, `createdAt`, `id`; `listTodayRecords`, `listActiveServiceOptions`, `listActiveBarbers`, `isDayClosed`, `todayOf`, `totalOf`). Acciones: `src/server/actions/records.ts`.
- Las interfaces que el plan consume existen: `SLOT_MINUTES`, `brandPalette`, `BRAND_PRESETS`, `contrastRatio`, `navItemsForRole`, `TodayAppointment`, `Drawer` de `@base-ui/react` 1.9 (`Portal container`, `VirtualKeyboardProvider`, `finalFocus`, `eventDetails.cancel()`), `useLinkStatus`, `unstable_rethrow`, `pg` (dependencia) y `dotenv` (dev).
- `next.config.ts` tiene `cacheComponents: true` **y** `partialPrefetching: true`.

**Docs de Next 16 a leer** (`node_modules/next/dist/docs/01-app/`): `02-guides/preserving-ui-state.md` (imprescindible: las rutas se ocultan con `<Activity>`, no se desmontan), `02-guides/instant-navigation.md`, `02-guides/authentication-with-cache-components.md`, `02-guides/optimizing-prefetching.md`, `03-api-reference/04-functions/use-link-status.md`, `unstable_rethrow.md`, `use-router.md`, `generate-viewport.md`, `01-getting-started/08-caching.md`.

## Criterios de aceptación

- **AC-1 Precios y reglas puras (tarea 1 del plan).** Se verifica con Vitest.
  - a) Los tests del plan para `formatPrice`, `nowLineIndex`, `appointmentTag`, `daySummary` y `findOpenTarget` (`PENDING` y `CONFIRMED` dan `open`; `COMPLETED`, `NO_SHOW` y `CANCELLED` dan `done`; id ausente da `gone`) están y pasan.
  - b) `formatPrice` no usa `Number()`, `parseFloat` ni `+x`. No queda ningún `Intl.NumberFormat` de moneda bajo `src/app/(dashboard)/`, y ningún archivo del panel importa `formatPrice` de un `format.ts` (se verifica con grep). `describePayout` usa `@/lib/money`.
  - c) `src/app/[slug]/format.ts` y `src/lib/admin-billing.ts` quedan intactos: la landing y `/admin` siguen con centavos.

- **AC-2 Tema, encabezado y contraste (tarea 2).**
  - a) Los tests de `panelThemeVars` del plan pasan. Los colores se leen con `getPanelBrand(session.barbershopId)`, siempre con el id de la sesión.
  - b) Los tokens viven solo en `panel.css` bajo `.panel-theme`, con los valores del plan. Landing, `/login`, `/invitacion` y `/admin` se ven igual que antes.
  - c) Las 5 secciones, sus fichas (`customers/[id]`, `services/[id]`, `barbers/[id]`), Mi cuenta y `BillingGate` usan `PanelHeader`: franja negra a todo el ancho, un solo `h1` en Anton y una línea de contexto. Las fichas tienen "Volver" a su lista, de 44 px o más. `BillingGate` conserva sus textos y el barbero sigue sin recibir datos de pago. Anton se usa solo en títulos y horas.
  - d) Peligro y errores en `#b42318` con las dos paletas; la acción peligrosa es texto sin fondo. La franja del poste aparece solo en la línea de ahora.
  - e) **[+]** Contraste AA (4.5:1) en texto, también en hover y en las filas atenuadas (nada de bajar la opacidad del texto por debajo de AA). Como el color de marca sobre `#eceef6` no llega (`#d7191f` da 4.48, `#9a6700` da 4.20), `--brand` y `--primary` como color de **texto** van solo sobre blanco. El `hover:bg-primary/80` de `Button` se neutraliza desde `panel.css` o `className` (`src/components/ui/**` no se toca). El foco visible sobre la franja negra es blanco.
  - f) **[+]** El aviso de cobro o de plan sigue arriba de todo y con el mismo texto; cuando está, es quien respeta el `safe-area` superior (no queda debajo del notch ni se duplica el espacio).

- **AC-3 Navegación, esqueletos y Mi cuenta (tarea 2).**
  - a) Los tests de orden del plan pasan: dueño Hoy, Caja, Servicios, Barberos, Ajustes; barbero Hoy, Mi cuenta. La barra va fija abajo con `safe-area`, y arriba desde 640 px. Sigue habiendo exactamente un ítem activo por sección.
  - b) Al tocar una pestaña el destino se marca al instante, sin mover el layout.
  - c) **[+]** Con la red lenta (CDP), al tocar cada pestaña se ve el título de la sección destino y un esqueleto con **su** forma: Hoy = resumen y filas de agenda; Caja = fecha, totales y lista; Servicios y Barberos = filas; Ajustes = bloques de formulario; Mi cuenta = datos y formulario; las fichas también. Nunca queda en blanco ni con el contenido de la pestaña anterior. Los fallbacks de `(dashboard)/layout.tsx` y `dashboard/layout.tsx` tampoco dejan la pantalla en blanco en la primera carga, y reservan el alto del encabezado y de la barra.
  - d) En Hoy, avatar con iniciales, `aria-label="Mi cuenta"`, de 44 px o más, que lleva a `/dashboard/account`. **[+]** En Ajustes, el encabezado tiene un enlace "Mi cuenta" (el diseño pide que el dueño también llegue desde ahí; el menú de Ajustes es de la tanda 3).
  - e) "Cerrar sesión" está en Mi cuenta con `form action={logout}` y ya no en el encabezado. **[+]** Con el panel bloqueado por cobro, el **dueño** llega a Mi cuenta desde el encabezado de `BillingGate` (su barra no tiene esa pestaña y Hoy no se renderiza); el barbero, por su pestaña.

- **AC-4 Hoja y aviso (tarea 3).**
  - a) Los tests de `safeAction` del plan pasan. El mensaje de fallo de red es el literal del plan.
  - b) `Sheet`: hasta 92% del alto, contenido con scroll, `footer` fijo y por encima del teclado; desde 640 px, diálogo centrado sin gesto. Cierra con ✕, Escape, toque afuera o deslizando. Al cerrar, el foco vuelve a quien la abrió (con `finalFocus` si se abre sin `Trigger`) y la página queda en el mismo scroll. Con `locked` no cierra por ningún camino.
  - c) Se monta dentro de `.panel-theme`: con "Verde y dorado", `--primary` computado adentro de la hoja es `#9a6700`.
  - d) Aviso: región `role="status"` siempre montada, 3 segundos, encima de la barra, dentro de `.panel-theme`. No está en un subárbol `inert` o `aria-hidden` cuando aparece el mensaje (si hace falta, se emite en `onClosed`).
  - e) Movimiento de 300 ms o menos; con `prefers-reduced-motion`, ninguno. Ninguna animación demora un envío.
  - f) **[+]** Al salir de Hoy por navegación, la hoja se cierra y su portal no queda visible sobre otra pantalla; al volver, Hoy aparece sin hoja abierta.

- **AC-5 Hoy como agenda (tarea 4).**
  - a) A 402×874 se ven por lo menos 4 turnos enteros, y a 360×640 "Registrar corte" está entero y visible sin scroll, por encima de la barra.
  - b) **[+]** Los turnos salen en el orden del servidor (hora y, en la misma hora, orden de reserva); `TodayBoard` no reordena y los terminados quedan atenuados en su lugar. Cada fila muestra hora, cliente, servicio y la etiqueta de `appointmentTag`.
  - c) Línea de ahora en `nowLineIndex`, con la hora en la zona de la barbería; arranca de `serverNow` sin error de hidratación y avanza cada minuto.
  - d) El resumen (`daySummary`, 44 px) abre la lista de cortes con todo lo que hoy muestra "Cortes de hoy": número, hora, barbero, "con turno", cliente con enlace a su ficha (o "Sin cliente"), servicios, medio y total.
  - e) Vacíos (Review Focus 5), con los textos del plan: sin turnos; sin servicios para el dueño y para el barbero; caja cerrada; lista de cortes vacía.
  - f) **[+]** Con la caja cerrada, tocar un turno abierto muestra el detalle sin Completar, No vino ni Cancelar (hoy tampoco se ofrecen).
  - g) Tocar un turno terminado abre el detalle, sin acciones que lo modifiquen.
  - h) Al volver a la app se refresca si pasaron 30 segundos, sin mover el scroll ni cerrar la hoja. Si el turno abierto pasó a terminado: detalle sin acciones. Si ya no está: la hoja se cierra con "Ese turno ya no está en tu lista" (Review Focus 3). Un refresco con un envío en curso no cierra la hoja `locked`.

- **AC-6 Registrar y completar (tarea 5).**
  - a) Corte sin turno en 3 toques: "Registrar corte", servicio, "Registrar $X". El botón pasa por "Elegí un servicio", "Registrar $X" y "Registrando…".
  - b) `WalkInSheet` conserva todo lo actual: varios servicios, medio, barbero (solo dueño), cliente opcional con búsqueda por teléfono (350 ms), nombre, notas y ficha. `ServiceTiles` y `PaymentPicker` mantienen `name="serviceIds"` y `name="paymentMethod"`. Lo seleccionado usa `--brand`; la acción, `--primary`.
  - c) **[+]** Borrador: cerrar la hoja y reabrirla lo conserva completo (servicios, medio, barbero, teléfono, nombre, cliente encontrado); sobrevive a `router.refresh()`; registrar con éxito lo limpia; **salir de Hoy y volver lo encuentra vacío**. Un servicio del borrador que se desactivó mientras tanto no se cuenta en el total ni se envía.
  - d) `AppointmentSheet`: notas del cliente, servicios con el reservado marcado aunque esté inactivo, medio, "¿Quién atendió?" solo si `barbers` no es `null` (con el barbero ya asignado por defecto si sigue activo), "Completar $X", "Llamar" (`tel:+…`) y "Ver ficha". "No vino" y "Cancelar turno" confirman dentro de la hoja; en `today/` no queda `window.confirm`.
  - e) Doble toque en Registrar o Completar, o en confirmar No vino o Cancelar: un solo envío (Review Focus 1). Mientras guarda, la hoja está `locked`.
  - f) Con éxito, la hoja se cierra y sale el aviso con el mensaje del servidor, nunca antes de su respuesta. Con error del servidor o de red, queda abierta, con `role="alert"` y los datos intactos (Review Focus 2).
  - g) Cliente de 60 caracteres y precio "15000.50" a 360 px, sin desborde en la agenda, las tres hojas y la ficha (Review Focus 4).
  - h) `pnpm exec tsx scripts/booking-smoke.ts` y `pnpm exec tsx scripts/cash-smoke.ts` pasan. `git diff main -- src/server/actions src/lib/auth.ts src/proxy.ts src/app/layout.tsx src/app/globals.css src/components/ui package.json pnpm-lock.yaml prisma` sale vacío.

- **AC-7 Medición (tarea 6).** `node scripts/panel-check.mjs --base <url> --owner <token> --barber <token> --out <dir>` contra `pnpm build` y `pnpm start` en el puerto del slot sale con 0, y con 1 si algo falla.
  - a) Cubre las capturas, aserciones y recorridos de la tarea 6 y los puntos **[+]** AC-3c, AC-3e, AC-4f, AC-5f y AC-6c.
  - b) Sin desborde horizontal a 360 px en ninguna sección ni hoja. En Hoy y sus hojas, la barra y los encabezados, ningún control visible mide menos de 44×44 px (de los `sr-only` se mide su `label`) y los campos tienen texto de 16 px o más en celular. Sin errores en consola.
  - c) **[+]** El script crea sus propios turnos del día (no depende de la hora ni del día de la semana; el seed no carga domingos) y **se niega a correr** si la base de `DATABASE_URL` no empieza con `barber_job_`. Todo Chrome que abre termina con un timeout, también si falla.
  - d) Las capturas se miran junto a las maquetas, incluido 1366×900 (la computadora no queda peor que hoy); lo que no coincida se corrige o se anota en `build.md`.

- **AC-8** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Diferencias con el plan

Correcciones mínimas; el producto acordado no cambia.

1. **`<Activity>` conserva el estado entre rutas.** El plan guarda el borrador y `OpenSheet` en el estado de `TodayBoard`, pero con `cacheComponents` Next oculta Hoy al navegar (hasta 3 rutas) en vez de desmontarla: el borrador no se borraría "al salir de Hoy" y una hoja abierta seguiría abierta al volver, con el portal fuera de la ruta oculta. Reiniciar ambos en un cleanup de `useLayoutEffect`, sin que `router.refresh()` los pierda. `key={bfcacheId}` solo no alcanza: con el botón Atrás restaura el estado viejo. Los timers y listeners se limpian en su efecto. En `panel-check.mjs`, filtrar por elementos visibles: el DOM de las rutas ocultas sigue en el documento.
2. **`setAppointmentStatus` no tiene forma de acción de formulario.** Su firma es `(id, status) => Promise<ActionResult>` y `safeAction` espera `(prev, FormData)`. Usar un adaptador de cliente `(_prev, fd) => setAppointmentStatus(id, status)`; la acción no se toca. Para `RecordFormState`, `onError` devuelve `{ ok: false, error, nonce: Date.now(), resetKey: prev?.resetKey ?? 0 }`.
3. **Mi cuenta del dueño con el panel bloqueado.** Al sacar el enlace y "Cerrar sesión" del encabezado, el dueño bloqueado queda sin salida (AC-3e).
4. **No existen tests de `describePayout`** (paso 4 de la tarea 1): no hay nada que actualizar. Hoy usa `Number(value)` también para el alquiler; ese pasa a `formatPrice(value)`. El porcentaje queda como está.
5. **`formatPrice` está en dos copias** (`today/format.ts` y `services/format.ts`); la tercera es el `Intl` interno de `barbers/format.ts`. Importadores en "Target Files". `close-form.tsx` recibe `totalLabel` ya formateado y no cambia.
6. **`useLinkStatus` no marca `pending` si la ruta ya está prefetcheada:** sirve como complemento de `usePathname`. Comprobarlo en `next start`, porque en dev no hay prefetch.
7. **`Button` y `globals.css` no se tocan:** no hay utilidad `text-warning`; usar `text-(--warning)`. El token se define acá, pero "Pendiente" aparece recién en Barberos (tanda 2); en Hoy no hay etiqueta "Pendiente".
8. **`services/[id]` no tiene `h1` hoy:** suma encabezado "Editar servicio" con `backHref`.
9. **`chipClass` de `today/format.ts`** pinta lo marcado con `bg-primary`; en la paleta nueva la selección va en `--brand`. Si queda sin uso, se borra.
10. **`dashboard-nav.test.ts`** fija el orden viejo y "BARBER ve solo Hoy": se reemplaza. `icons` de `dashboard-nav.tsx` necesita `/dashboard/account`.
11. **"Sin acciones" en un turno terminado** se lee como sin Completar, No vino ni Cancelar. "Llamar" y "Ver ficha" se mantienen, porque hoy esos enlaces existen en los turnos terminados.

## Verificación (para el builder)

- Usar solo la base del worktree (`barber_job_030`, la de su `.env`). **Nunca** la base local `barber` del usuario: confirmar `DATABASE_URL` antes de cada seed, smoke o `panel-check`.
- Medir en Chrome por DevTools Protocol con `Emulation.setDeviceMetricsOverride`: en Windows `--window-size` no baja de unos 500 px. Envolver todo Chrome en un timeout, con su propio `--user-data-dir` temporal y puerto de depuración, y matar solo el proceso propio.
- No tocar los procesos de los puertos 3000 y 8080. Usar el puerto del slot y apagarlo al terminar.
- Tokens: `signSession` (`src/lib/session.ts`) con el `SESSION_SECRET` del worktree y usuarios del seed; el nombre de la cookie es `SESSION_COOKIE` y se setea por CDP. Las capturas y los tokens no se commitean.
- Node 24 trae `WebSocket` global; `ws` no está instalado y no se agregan dependencias. Desde el `.mjs`, la base se toca con `pg` y `dotenv`.

## Target Files (Scope)
- `src/lib/money.ts`
- `src/lib/money.test.ts`
- `src/lib/today-board.ts`
- `src/lib/today-board.test.ts`
- `src/lib/safe-action.ts`
- `src/lib/safe-action.test.ts`
- `src/lib/brand-colors.ts`
- `src/lib/brand-colors.test.ts`
- `src/lib/dashboard-nav.ts`
- `src/lib/dashboard-nav.test.ts`
- `src/server/queries/landing.ts`
- `src/components/dashboard-nav.tsx`
- `src/components/panel/**`
- `src/app/(dashboard)/panel.css`
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/billing-gate.tsx`
- `src/app/(dashboard)/(account)/dashboard/account/page.tsx`
- `src/app/(dashboard)/dashboard/layout.tsx`
- `src/app/(dashboard)/dashboard/today/page.tsx`
- `src/app/(dashboard)/dashboard/today/today-board.tsx`
- `src/app/(dashboard)/dashboard/today/walk-in-sheet.tsx`
- `src/app/(dashboard)/dashboard/today/appointment-sheet.tsx`
- `src/app/(dashboard)/dashboard/today/records-sheet.tsx`
- `src/app/(dashboard)/dashboard/today/fields.tsx`
- `src/app/(dashboard)/dashboard/today/format.ts`
- `src/app/(dashboard)/dashboard/today/walk-in-form.tsx`
- `src/app/(dashboard)/dashboard/today/appointment-actions.tsx`
- `src/app/(dashboard)/dashboard/today/customers/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/cash/page.tsx`
- `src/app/(dashboard)/dashboard/services/page.tsx`
- `src/app/(dashboard)/dashboard/services/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/services/format.ts`
- `src/app/(dashboard)/dashboard/services/bulk-price-form.tsx`
- `src/app/(dashboard)/dashboard/barbers/page.tsx`
- `src/app/(dashboard)/dashboard/barbers/[id]/page.tsx`
- `src/app/(dashboard)/dashboard/barbers/format.ts`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `scripts/panel-check.mjs`

## Fuera de alcance
- **Tanda 2** (contenido de Caja, Servicios y Barberos): total grande y barra de medios, hoja de cierre (`window.confirm` de `close-form.tsx` se queda), filas compactas, `/dashboard/services/prices`, hojas de servicio, invitación y ficha de barbero, "Pendiente" en ámbar. Acá esas pantallas solo toman encabezado, barra, colores, precios y esqueleto, y siguen funcionando.
- **Tanda 3** (Ajustes y Mi cuenta): menú de Ajustes, pantallas `profile`, `hours`, `photos` y `colors`, separar `landing-form.tsx`, aviso de cambios sin guardar, "Copiar a todos los días". En Mi cuenta solo se suman el encabezado y "Cerrar sesión".
- Cambiar Server Actions, permisos, validaciones, cálculos, queries de records, schema, dependencias o variables de entorno.
- `src/lib/auth.ts`, `src/proxy.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/**`, la landing, `/login`, `/invitacion` y `/admin`.
- Modo oscuro, sin conexión, notificaciones, instalar la app, y los jobs 009, 010 y 011. "Esperando" no existe como etiqueta.

## Riesgos
- **Dinero:** un doble envío o un reintento tras perder la respuesta duplica cortes, y no hay idempotencia en el servidor (fuera de alcance). La protección es el bloqueo en el cliente y el mensaje que pide verificar antes de repetir.
- **Datos de otros tenants:** `getPanelBrand` recibe solo el `barbershopId` de la sesión. Los datos de Hoy pasan ahora a un componente de cliente: no sumar campos a lo que ya se muestra; el filtro por rol sigue en `records.ts`.
- **Estado tras cerrar sesión:** el borrador (teléfono y nombre del cliente) no puede quedar visible para otro usuario en el mismo dispositivo. AC-6c lo cubre, porque cerrar sesión obliga a salir de Hoy.
- **Auth y cobro:** se reordena el layout de sesión; `PanelGate` y `BillingGate` tienen que seguir cortando el panel, y la sesión va siempre dentro de `<Suspense>`.
- **Estilos:** `panel.css` se importa global; todo selector va bajo `.panel-theme` para no filtrarse a la landing ni a `/admin`.
- Sin cambios de schema, sin dependencias nuevas y sin hot files.
