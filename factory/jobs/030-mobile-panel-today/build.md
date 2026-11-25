# Build: 030-mobile-panel-today
**Rama:** factory/030-mobile-panel-today · **Commit:** dcd2077 · **Worktree:** .worktrees/030-mobile-panel-today

Un commit por tarea del plan (768642b, 5eb5a73, 30970e8, 6e9e35c, 6e85cde, dc3c826) más dcd2077, con los arreglos que salieron de la medición.

## Qué cambió
- `src/lib/money.ts` (+test): único `formatPrice` del panel.
- `src/lib/today-board.ts` (+test): línea de ahora, etiquetas, resumen y `findOpenTarget`.
- `src/lib/safe-action.ts` (+test): fallo de red convertido en error de formulario.
- `src/lib/brand-colors.ts` (+test): `panelThemeVars`.
- `src/lib/dashboard-nav.ts` (+test): orden nuevo y "Mi cuenta" para el barbero.
- `src/server/queries/landing.ts`: `getPanelBrand` (memoizado, id de la sesión).
- `src/components/dashboard-nav.tsx`: barra nueva, destino marcado con `useLinkStatus`, y su fallback.
- `src/components/panel/`: `panel-header`, `portal-context`, `sheet`, `toast`, `use-sheet-action` (envío único), `skeletons`, `panel-fallback`.
- `src/app/(dashboard)/panel.css`: tokens y reglas, todo bajo `.panel-theme`.
- `src/app/(dashboard)/layout.tsx`: `PanelShell` (sesión, colores, aviso, barra, portal y avisos) y su esqueleto.
- `src/app/(dashboard)/billing-gate.tsx`: encabezado nuevo; el dueño llega a Mi cuenta. Mismos textos.
- `(account)/dashboard/account/page.tsx`: encabezado y "Cerrar sesión".
- `dashboard/layout.tsx`: fallback con el esqueleto de la pantalla destino.
- `dashboard/{cash,services,barbers,settings}/page.tsx` y fichas `services/[id]`, `barbers/[id]`, `today/customers/[id]`: encabezado, contexto, "Volver", esqueleto y precios.
- `services/format.ts`, `services/bulk-price-form.tsx`, `barbers/format.ts`, `today/format.ts`: sin copias de `formatPrice`; campos blancos.
- `today/`: `page.tsx`, `today-board.tsx`, `walk-in-sheet.tsx`, `appointment-sheet.tsx`, `records-sheet.tsx`, `fields.tsx`. Borrados `walk-in-form.tsx` y `appointment-actions.tsx`.
- `scripts/panel-check.mjs`: capturas, mediciones y recorridos.

## Criterios de aceptación
`panel-check` = `node scripts/panel-check.mjs --base http://localhost:3001 --owner <token> --barber <token> --out <dir>` contra `pnpm build` + `pnpm start --port 3001` y la base `barber_job_030`. Última corrida completa, sobre dcd2077: `859 verificaciones pasaron, 0 fallaron.` y salida 0.

| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1a | ✅ | `pnpm test`: 520 pasan (incluye los del plan; primero se vieron fallar). |
| AC-1b | ✅ | `grep -rn "Intl.NumberFormat\|formatPrice.*format\"" "src/app/(dashboard)"` da solo `barbers/format.ts` (el porcentaje, no es moneda). `formatPrice` usa el string. |
| AC-1c | ✅ | `git diff main -- src/app/[slug]/format.ts src/lib/admin-billing.ts` vacío. |
| AC-2a | ✅ | Tests de `panelThemeVars`; `getPanelBrand(session.barbershopId)` en el layout. |
| AC-2b | ✅ (con nota) | Todo selector de `panel.css` empieza con `.panel-theme`. `panel-check`: landing, `/login` y `/admin/login` sin `.panel-theme` ni `--brand`; capturas miradas. No comparé píxel a píxel contra main; `/invitacion` no se abrió (ningún archivo suyo cambió). |
| AC-2c | ✅ | `panel-check`: un solo `h1` en Anton por pantalla, "Volver" de 44 px a su lista; barbero bloqueado sin datos de pago en el HTML. |
| AC-2d | ✅ | Error `rgb(180, 35, 24)`; acción peligrosa sin fondo; una sola `.pole` en Hoy y ninguna en Caja. |
| AC-2e | ✅ | `panel-check` mide el contraste de todo el texto visible en cada pantalla y hoja, con las dos paletas: ninguno bajo 4.5. Acción con hover ≥ 4.5. Foco blanco en la franja. |
| AC-2f | ✅ | Con `setSafeAreaInsetsOverride` 47/34: aviso en `top: 0` con el área segura y encabezado en 0; sin aviso, encabezado con 47. |
| AC-3a | ✅ | Tests de orden; 1 ítem activo por sección (0 en Mi cuenta del dueño, que no tiene pestaña). |
| AC-3b | ✅ | Red de 2 s: destino marcado a los 160 ms y los rectángulos de la barra no cambian. |
| AC-3c | ✅ | Mismo recorrido: título y esqueleto propio en las 6 pantallas y las 3 fichas (también entre Mi cuenta y el resto). Primera carga: esqueleto, título y alto de la barra en el HTML inicial; en la ficha el HTML inicial es el esqueleto genérico (la ruta no se conoce al prerenderizar). |
| AC-3d | ✅ | Avatar y enlace "Mi cuenta" de Ajustes medidos. |
| AC-3e | ✅ | "Cerrar sesión" lleva a `/login`; dueño y barbero bloqueados llegan a Mi cuenta. |
| AC-4a | ✅ | Tests de `safeAction`, con el mensaje literal. |
| AC-4b | ✅ (con nota) | 92%, ✕, Escape, toque afuera y deslizar, cada uno con vuelta del foco y mismo scroll; `locked` no cierra por ningún camino; 1366 centrada y sin gesto. El teclado en pantalla se **simuló** achicando `visualViewport` 300 px: la acción queda arriba. No se probó en un teléfono real. |
| AC-4c | ✅ | `--primary` = `#9a6700` dentro de las hojas con "Verde y dorado". |
| AC-4d | ✅ | `role="status"`, fuera de `inert`/`aria-hidden`, 3 s, encima de la barra; se emite en `onClosed`. |
| AC-4e | ✅ | Duración máxima ≤ 300 ms; con movimiento reducido, 0 animaciones y transiciones de 0 s. |
| AC-4f | ✅ | "Ver ficha", Atrás y pestaña: sin hoja ni portal visibles y con scroll libre. |
| AC-5a | ✅ | 402×874: al menos 4 turnos enteros; 360×640: botón entero sin scroll y sobre la barra. |
| AC-5b | ✅ | Orden igual al de la base; etiquetas; terminados atenuados en su lugar. |
| AC-5c | ✅ | Posición calculada contra la base, hora de la barbería con el navegador en Asia/Tokyo, avanza en menos de 65 s; sin errores de hidratación en `start` ni en `dev`. |
| AC-5d | ✅ | Resumen de 44 px o más y lista completa. |
| AC-5e | ✅ | Los cinco vacíos con sus textos. |
| AC-5f | ✅ | Caja cerrada: detalle sin acciones. |
| AC-5g | ✅ | Terminado: detalle sin acciones (quedan Llamar y Ver ficha). |
| AC-5h | ✅ | Antes de 30 s no refresca; después, "Completado" sin acciones, "Ese turno ya no está en tu lista" y envío en curso sin cerrar; scroll igual. |
| AC-6a | ✅ | 3 toques, con los tres textos del botón. |
| AC-6b | ✅ | Recorridos de corte con y sin cliente; `name` conservados. |
| AC-6c | ✅ | Reabrir, refresco, éxito, servicio desactivado, salir con pestaña y con Atrás. |
| AC-6d | ✅ | Reservado inactivo marcado, barbero por defecto, `tel:+`, confirmación en la hoja; `grep window.confirm today/` vacío y ningún diálogo nativo. |
| AC-6e | ✅ | Dos clics en el mismo tick más dos toques: 1 corte y 1 POST. Ídem Completar y No vino. Cancelar usa el mismo envío que No vino (no tiene prueba de doble toque propia). |
| AC-6f | ✅ | Sin conexión y con error del servidor: abierta, `role="alert"`, datos intactos; al reconectar registra lo elegido. |
| AC-6g | ✅ | Cliente de 60 caracteres y "15000.50" a 360 sin desborde. |
| AC-6h | ✅ | `booking-smoke` y `cash-smoke` salen con 0; el `git diff main` de los archivos protegidos sale vacío. |
| AC-7a, b | ✅ | `panel-check`, salida 0. |
| AC-7c | ✅ | `DATABASE_URL=…/barber node scripts/panel-check.mjs …` → `Me niego a correr: la base "barber" no empieza con "barber_job_".`, salida 1. También salió con 1 cuando fallaron verificaciones. Timeout por comando y global; sin Chrome propio colgado. |
| AC-7d | ✅ | Capturas miradas junto a `panel-completo.html` (abajo). |
| AC-8 | ✅ | Ver Checks. |

## Diferencias con la maqueta
- Medio de pago: la selección usa el color principal (AC-6b); en la maqueta el borde es negro.
- "No vino o canceló" son dos acciones; se suman "Ver ficha" y "Cliente (opcional)" (diseño y AC-6).
- Peligro en rojo fijo, no en el color de marca (diseño).
- "Cerrar sesión" es un botón con borde, no texto rojo: el diseño reserva ese estilo para acciones que piden confirmación.
- La fila terminada muestra servicio y barbero (AC-5b); en la maqueta, solo "Atendió Martín".
- El resumen lleva una flecha, para que se note que se toca.
- El contenido de Caja, Servicios, Barberos y Ajustes es el de hoy (tandas 2 y 3).

## Decisiones
- `use-sheet-action.ts`: el bloqueo es un `ref` y dura hasta que la hoja termina de cerrarse. Si se sale de Hoy con un envío en curso, el resultado se avisa igual y la hoja nueva no hereda nada (probado).
- Los formularios usan `onSubmit`: con `action`, React los reinicia al terminar y con error se perdía la garantía de datos intactos.
- "Ir" del teclado en teléfono o nombre cierra el teclado; no registra.
- Al cliente no viajan las notas del turno ni los ids de barbero e ítems de los cortes: hoy no se muestran.
- `tel:` deja solo dígitos (el seed guarda el teléfono con `+`).

## No verificado
- iPhone y Android reales: teclado, gesto y áreas seguras se emularon en Chrome.
- Lectores de pantalla reales (se comprobaron roles, `aria-hidden` e `inert`).

## Checks
lint ✅ · typecheck ✅ · test ✅ (520) · build ✅ · booking-smoke ✅ · cash-smoke ✅

No se crearon bases descartables (solo existe `barber_job_030`). Puerto 3001 cerrado.
