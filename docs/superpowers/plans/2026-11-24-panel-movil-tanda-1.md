# Panel móvil, tanda 1 (base y Hoy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al panel su base visual para celular (tema, encabezado, barra, hoja, aviso, precios) y rehacer Hoy como agenda con hojas.

**Architecture:** La lógica nueva es pura y va en `src/lib/` con Vitest. El layout del panel resuelve sesión y colores en un `PanelShell` de servidor, y Hoy pasa a un `TodayBoard` de cliente que recibe los datos del servidor y abre hojas sobre `Drawer` de Base UI. Las Server Actions de Hoy no cambian.

**Tech Stack:** Next 16.4.6 (`cacheComponents`), React 19, Tailwind 4, `@base-ui/react` 1.9, Vitest 5. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-24-panel-movil-design.md` (secciones Base visual, Navegación, Hoja, Hoy y Precios) y sus maquetas.

## Global Constraints

- Leer la guía de `node_modules/next/dist/docs/` antes de escribir código de Next (`AGENTS.md`).
- Sin dependencias, migraciones ni variables de entorno. No tocar `src/lib/auth.ts`, `src/proxy.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/**`, `src/server/actions/**`, la landing ni `/admin`.
- Ningún permiso, validación ni cálculo cambia. `"use client"` solo en hojas y componentes interactivos; lo que depende de la sesión, dentro de `<Suspense>`.
- Táctil ≥ 44 px, campos con texto de 16 px, contraste AA, foco visible, movimiento ≤ 300 ms y nulo con `prefers-reduced-motion`.
- Textos en español rioplatense. Anton solo en títulos y horas.
- Peligro y errores en rojo fijo `#b42318`; "Pendiente" en `#8a5300`. La franja del poste, solo en la línea de ahora.
- Nada se muestra como guardado antes de la respuesta del servidor.

## Review Focus

1. Doble toque en "Registrar" con red lenta: un solo corte.
2. Se corta la conexión al guardar: la hoja sigue abierta, con lo cargado y un mensaje.
3. Otro barbero completa, o le asignan, el turno que tengo abierto: sin caída y sin acciones sobre un turno que ya no está.
4. Nombre de cliente de 60 caracteres y precio con centavos a 360 px: sin desborde.
5. Cero turnos, cero servicios o caja cerrada: cada caso dice qué hacer.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/lib/money.ts` | Único formateador de precios del panel |
| `src/lib/today-board.ts` | Reglas puras de la agenda |
| `src/lib/safe-action.ts` | Fallo de red convertido en error de formulario |
| `src/lib/brand-colors.ts` (mod.) | `panelThemeVars` |
| `src/app/(dashboard)/panel.css` | Tokens de `.panel-theme` |
| `src/components/panel/{panel-header,portal-context,sheet,toast}.tsx` | Piezas compartidas |
| `src/app/(dashboard)/dashboard/today/{today-board,walk-in-sheet,appointment-sheet,records-sheet}.tsx` | Hoy |
| `scripts/panel-check.mjs` | Mediciones y recorridos en Chrome |

---

### Task 1: Precios y reglas de la agenda

**Files:**
- Create: `src/lib/money.ts`, `src/lib/money.test.ts`, `src/lib/today-board.ts`, `src/lib/today-board.test.ts`
- Modify: `dashboard/today/format.ts`, `dashboard/services/format.ts`, `dashboard/barbers/format.ts` (bajo `src/app/(dashboard)/`) y quienes importan `formatPrice` de ahí

**Interfaces:**
- Produces: `formatPrice(price: string): string`; `nowLineIndex(startsAt: readonly Date[], now: Date): number`; `appointmentTag(a: Pick<TodayAppointment, "status" | "barber">): { label: string; tone: "accent" | "muted" | "neutral" }`; `daySummary(role: "OWNER" | "BARBER", count: number, total: string): string`; `findOpenTarget(items: readonly TodayAppointment[], id: string): { state: "open" | "done"; appointment: TodayAppointment } | { state: "gone" }`

- [ ] **Step 1: Tests que fallan**

```ts
it("sin centavos cuando son cero, con dos cuando no", () => {
  expect(formatPrice("15000.00")).toBe("$15.000");
  expect(formatPrice("15000")).toBe("$15.000");
  expect(formatPrice("1500.5")).toBe("$1.500,50");
  expect(formatPrice("-18000.00")).toBe("-$18.000");
  expect(formatPrice("12345678901234.10")).toBe("$12.345.678.901.234,10");
});

const at = (h: string) => new Date(`2026-11-24T${h}:00-03:00`);
it("la línea va antes del primer turno cuya hora no terminó", () => {
  const list = ["10:00", "11:00", "12:00", "12:00"].map(at);
  expect(nowLineIndex(list, at("11:20"))).toBe(1);
  expect(nowLineIndex(list, at("11:00"))).toBe(1); // 10:00 terminó justo a las 11:00
  expect(nowLineIndex(list, at("09:00"))).toBe(0);
  expect(nowLineIndex(list, at("13:00"))).toBe(4);
  expect(nowLineIndex([], at("11:00"))).toBe(0);
});

it("etiquetas", () => {
  const barber = { id: "b", name: "Martín" };
  expect(appointmentTag({ status: "PENDING", barber: null })).toEqual({ label: "Sin asignar", tone: "accent" });
  expect(appointmentTag({ status: "CONFIRMED", barber })).toEqual({ label: "Martín", tone: "neutral" });
  expect(appointmentTag({ status: "COMPLETED", barber })).toEqual({ label: "Listo", tone: "muted" });
  expect(appointmentTag({ status: "NO_SHOW", barber: null })).toEqual({ label: "No vino", tone: "muted" });
  expect(appointmentTag({ status: "CANCELLED", barber: null })).toEqual({ label: "Cancelado", tone: "muted" });
});

it("resumen", () => {
  expect(daySummary("BARBER", 2, "36000.00")).toBe("Hiciste 2 cortes por $36.000");
  expect(daySummary("BARBER", 1, "15000.00")).toBe("Hiciste 1 corte por $15.000");
  expect(daySummary("BARBER", 0, "0.00")).toBe("Todavía no hiciste cortes hoy");
  expect(daySummary("OWNER", 5, "88000.00")).toBe("La barbería lleva 5 cortes por $88.000");
  expect(daySummary("OWNER", 0, "0.00")).toBe("La barbería todavía no tiene cortes hoy");
});
```

Más `findOpenTarget`: un `PENDING` da `open`, un `COMPLETED` da `done`, un id ausente da `gone` (Review Focus 3).

- [ ] **Step 2:** `pnpm exec vitest run src/lib/money.test.ts src/lib/today-board.test.ts`. Esperado: FAIL, módulos inexistentes.
- [ ] **Step 3:** Implementar. `formatPrice` formatea el string con `Intl` (`StringNumericLiteral`), sin `Number()`, y quita el espacio entre `$` y el número. `today-board.ts` usa `SLOT_MINUTES` de `@/lib/slots` e importa los tipos de records con `import type`.
- [ ] **Step 4:** Reemplazar las tres copias del panel por `@/lib/money`; `describePayout` también. Actualizar los tests de `describePayout` si fijan centavos.
- [ ] **Step 5:** `pnpm test && pnpm typecheck && pnpm lint`. Esperado: todo pasa. Commit `feat(panel): precios sin centavos y reglas de la agenda`.

### Task 2: Tema, encabezado y barra

**Files:**
- Create: `src/app/(dashboard)/panel.css`, `src/components/panel/panel-header.tsx`, `src/components/panel/portal-context.tsx`
- Modify: `src/lib/brand-colors.ts`, `src/lib/brand-colors.test.ts`, `src/server/queries/landing.ts`, `src/lib/dashboard-nav.ts`, `src/lib/dashboard-nav.test.ts`, `src/components/dashboard-nav.tsx`, `src/app/(dashboard)/layout.tsx`, `billing-gate.tsx`, `(account)/dashboard/account/page.tsx`, y el encabezado de cada `page.tsx` del panel

**Interfaces:**
- Produces: `panelThemeVars(primary: string | null, secondary: string | null): { "--brand": string; "--primary": string; "--pole-a": string; "--pole-b": string }`; `getPanelBrand(barbershopId: string): Promise<{ primary: string | null; secondary: string | null }>` (con `cache` de React); `<PanelHeader title context? backHref? action? />`; `<PanelBody>`; `PanelPortalProvider` y `usePanelPortal(): HTMLElement | null`

- [ ] **Step 1: Tests que fallan**

```ts
it("tema del panel: colores originales y ajustados", () => {
  expect(panelThemeVars(null, null)).toEqual({ "--brand": "#1f2e9a", "--primary": "#d7191f", "--pole-a": "#1f2e9a", "--pole-b": "#d7191f" });
  for (const p of BRAND_PRESETS) {
    const v = panelThemeVars(p.primary, p.secondary);
    expect(contrastRatio(v["--primary"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(v["--brand"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
  }
  expect(panelThemeVars("red;}", "x")).toEqual(panelThemeVars(null, null));
});
it("orden del dueño", () => expect(navItemsForRole("OWNER").map((i) => i.label)).toEqual(["Hoy", "Caja", "Servicios", "Barberos", "Ajustes"]));
it("barbero", () => expect(navItemsForRole("BARBER")).toEqual([{ href: "/dashboard/today", label: "Hoy" }, { href: "/dashboard/account", label: "Mi cuenta" }]));
```

- [ ] **Step 2:** Correrlos y ver FAIL. Implementar `panelThemeVars` sobre `brandPalette`, y la navegación.
- [ ] **Step 3:** `panel.css`, acotado a `.panel-theme`: `--background #eceef6`, `--card #fff`, `--foreground #000`, `--muted-foreground #555c72`, `--border #d5d9e6`, `--input #d5d9e6`, `--primary-foreground #fff`, `--destructive #b42318`, `--warning #8a5300`, `--ring var(--brand)`, y la clase `.pole` con la franja.
- [ ] **Step 4:** En el layout: Anton con `next/font` (como en `src/app/[slug]/layout.tsx`), `export const viewport = { themeColor: "#000000", viewportFit: "cover" }`, y un `PanelShell` async dentro de `<Suspense>` que aplica `panelThemeVars` con `style`, y muestra aviso de cobro, `children` y barra. Dentro del tema va el nodo de `PanelPortalProvider`: **los portales se montan ahí**, o pierden los colores.
- [ ] **Step 5:** `PanelHeader`: franja negra a todo el ancho con `padding-top` de `safe-area`, `h1` en Anton y contexto. Reemplaza el `h1` de todas las pantallas; las fichas usan `backHref` con "Volver". El contenido pasa a `PanelBody` (ancho máximo actual y padding que deja libre la barra). `BillingGate` usa las mismas piezas, sin cambiar textos.
- [ ] **Step 6:** Barra: línea de 3 px arriba del activo; con `useLinkStatus` el destino se marca al tocar, en un elemento de tamaño fijo. "Cerrar sesión" sale del encabezado y va en Mi cuenta, con su `form action={logout}`.
- [ ] **Step 7:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build`. Abrir cada sección como dueño y barbero: sin errores en consola, y Mi cuenta accesible con el panel bloqueado. Commit `feat(panel): tema por barbería, encabezado y barra`.

### Task 3: Hoja y aviso

**Files:**
- Create: `src/components/panel/sheet.tsx`, `src/components/panel/toast.tsx`, `src/lib/safe-action.ts`, `src/lib/safe-action.test.ts`
- Modify: `src/app/(dashboard)/layout.tsx` (proveedor de avisos)

**Interfaces:**
- Consumes: `usePanelPortal()` (Task 2)
- Produces: `<Sheet open onOpenChange title locked? footer? onClosed?>`; `useToast(): (message: string) => void`; `safeAction<S>(action: (prev: S, fd: FormData) => Promise<S>, onError: (prev: S) => S, rethrow: (e: unknown) => void): (prev: S, fd: FormData) => Promise<S>`

- [ ] **Step 1: Tests que fallan** (Review Focus 2)

```ts
it("un fallo de red devuelve el estado de error", async () => {
  const run = safeAction(async () => { throw new TypeError("Failed to fetch"); }, () => "error", () => {});
  expect(await run("antes", new FormData())).toBe("error");
});
it("deja pasar las redirecciones de Next", async () => {
  const redirect = new Error("NEXT_REDIRECT");
  const run = safeAction(async () => { throw redirect; }, () => "error", (e) => { if (e === redirect) throw e; });
  await expect(run("antes", new FormData())).rejects.toBe(redirect);
});
```

- [ ] **Step 2:** Ver FAIL, implementar y ver PASS. En la UI, `rethrow` es `unstable_rethrow` de `next/navigation`, y el mensaje es: "No se pudo confirmar. Revisá la conexión y fijate si quedó registrado antes de repetir." (la respuesta pudo perderse después de guardar).
- [ ] **Step 3:** `Sheet` sobre `Drawer` de Base UI, `Portal` con `container={usePanelPortal()}`. Hasta 92% del alto, contenido con scroll, `footer` fijo y por encima del teclado (`VirtualKeyboardProvider`). Desde 640 px, centrada y sin gesto. Con `locked`, `onOpenChange` cancela cualquier cierre y el ✕ queda deshabilitado. Al cerrar, el foco vuelve a quien la abrió.
- [ ] **Step 4:** `useToast`: una región `role="status"` siempre montada, 3 segundos, encima de la barra.
- [ ] **Step 5:** `pnpm test && pnpm typecheck && pnpm lint`. Commit `feat(panel): hoja y aviso`.

### Task 4: Hoy como agenda

**Files:**
- Create: `dashboard/today/today-board.tsx`, `dashboard/today/records-sheet.tsx`
- Modify: `dashboard/today/page.tsx`

**Interfaces:**
- Consumes: Task 1 completa, `PanelHeader`, `PanelBody`, `Sheet`
- Produces: `<TodayBoard role currentUserId timeZone serverNow={number} appointments records total services barbers closed />`; estado `OpenSheet = { kind: "walk-in" } | { kind: "appointment"; id: string } | { kind: "records" } | null`

- [ ] **Step 1:** `page.tsx` deja solo encabezado ("Hoy", fecha larga, avatar con iniciales y `aria-label="Mi cuenta"`), la carga de datos actual y `<TodayBoard>`. El esqueleto tiene la forma de la agenda.
- [ ] **Step 2:** Agenda: resumen como botón (44 px) que abre la lista de cortes; filas como botón con hora en Anton, cliente en una línea con recorte, servicio y etiqueta; terminados atenuados en su lugar. Línea de ahora en `nowLineIndex`, con la hora local; avanza cada minuto y arranca de `serverNow` para no diferir al hidratar.
- [ ] **Step 3:** Botón "Registrar corte" fijo sobre la barra. Con `closed`: "La caja de hoy ya está cerrada". Sin servicios: dueño, enlace "Cargá tus servicios" a `/dashboard/services`; barbero, "Pedile al dueño que cargue los servicios". Sin turnos: "No hay turnos para hoy." (Review Focus 5).
- [ ] **Step 4:** Al volver a estar visible, `router.refresh()` si pasaron 30 segundos desde el último. No mueve el scroll ni cierra la hoja. Si `findOpenTarget` da `gone`, la hoja se cierra con el aviso "Ese turno ya no está en tu lista"; si da `done`, muestra el detalle sin acciones.
- [ ] **Step 5:** `RecordsSheet`: los mismos datos que hoy muestra "Cortes de hoy". Vacía: "Todavía no se registró ningún corte hoy."
- [ ] **Step 6:** `pnpm typecheck && pnpm lint && pnpm build`. Commit `feat(today): agenda con línea de ahora y lista de cortes`.

### Task 5: Registrar y completar en hojas

**Files:**
- Create: `dashboard/today/walk-in-sheet.tsx`, `dashboard/today/appointment-sheet.tsx`
- Modify: `dashboard/today/fields.tsx`, `dashboard/today/today-board.tsx`
- Delete: `dashboard/today/walk-in-form.tsx`, `dashboard/today/appointment-actions.tsx`

**Interfaces:**
- Consumes: `Sheet`, `useToast`, `safeAction`, `createWalkIn`, `completeAppointment`, `setAppointmentStatus`, `lookupCustomer` (sin cambios)
- Produces: `<ServiceTiles>` y `<PaymentPicker>` en `fields.tsx`, para la tanda 2

- [ ] **Step 1:** `ServiceTiles` reemplaza a `ServiceChips`: dos columnas, nombre hasta dos líneas y precio; varios a la vez; mismo `name="serviceIds"`. `PaymentPicker`: los cuatro medios en una fila ("Transf." con `aria-label` "Transferencia"), mismo `name="paymentMethod"`.
- [ ] **Step 2:** `WalkInSheet`: todo lo que tiene `WalkInForm`, con la misma búsqueda por teléfono y espera de 350 ms. El borrador vive en `TodayBoard`: cerrar la hoja lo conserva, registrar lo limpia. Botón: "Elegí un servicio" (deshabilitado), "Registrar $15.000", "Registrando…".
- [ ] **Step 3:** `AppointmentSheet`: notas, servicios con el reservado marcado aunque esté inactivo, medio, "¿Quién atendió?" solo si `barbers` no es `null`, "Completar $X", "Llamar" (`tel:`), "Ver ficha". "No vino" y "Cancelar turno" son texto en rojo fijo y piden confirmación **dentro de la hoja** ("¿Marcar que Juan no vino?", "Sí, no vino", "Volver"); se va `window.confirm`.
- [ ] **Step 4:** Envíos con `safeAction` y un `useRef` que bloquea el segundo envío hasta la respuesta (Review Focus 1). Mientras guarda, `locked`. Con éxito: cerrar y `useToast` con el mensaje del servidor. Con error: abierta, mensaje `role="alert"` y datos intactos.
- [ ] **Step 5:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm exec tsx scripts/booking-smoke.ts && pnpm exec tsx scripts/cash-smoke.ts`. Esperado: todo pasa. Commit `feat(today): registrar y completar desde hojas`.

### Task 6: Medición y recorridos

**Files:**
- Create: `scripts/panel-check.mjs`

**Interfaces:**
- Produces: `node scripts/panel-check.mjs --base <url> --owner <token> --barber <token> --out <dir>`; sale con 1 si algo falla. Chrome por `CHROME_PATH`, controlado con el `WebSocket` de Node. La tanda 2 y la 3 lo amplían.

- [ ] **Step 1:** Capturas a 360×640, 402×874 y 1366×900, dueño y barbero, con la paleta por defecto y "Verde y dorado", de todas las secciones y de las tres hojas de Hoy.
- [ ] **Step 2:** Aserciones: sin desborde horizontal a 360 en ninguna sección; en Hoy, ningún control menor a 44 px, "Registrar corte" entero y visible a 360×640, y al menos 4 turnos visibles a 402×874; los colores de la hoja son los de la barbería.
- [ ] **Step 3:** Recorridos sobre una base descartable con el seed:
  - corte en 3 toques, y verifica el aviso y el resumen;
  - doble clic seguido en Registrar: los cortes suben exactamente 1 (Review Focus 1);
  - sin conexión (`Network.emulateNetworkConditions`): la hoja sigue abierta, los servicios marcados y el mensaje visible (Review Focus 2);
  - completar por base el turno abierto y disparar `visibilitychange`: se muestra sin acciones (Review Focus 3);
  - cliente de 60 caracteres y servicio de "15000.50" a 360 px, sin desborde (Review Focus 4);
  - día cerrado, sin turnos y sin servicios (Review Focus 5);
  - completar, no vino y cancelar; Escape y vuelta del foco; `prefers-reduced-motion`; panel bloqueado por cobro.
- [ ] **Step 4:** Correrlo contra `pnpm build && pnpm start`. Esperado: salida 0. Mirar las capturas junto a las maquetas y corregir lo que no coincida.
- [ ] **Step 5:** Commit `test(panel): medición y recorridos en celular`.

## Fuera de esta tanda

El contenido de Caja, Servicios, Barberos y Ajustes (tandas 2 y 3): acá solo toman encabezado, barra, colores y precios, y siguen funcionando.
