# Restyle urbano de la landing pública

**Pedido:** "Me gustaría que el estilo de la web pública sea más urbano, mirá el logo."

**Decisiones del dueño (cerradas):**
1. El estilo urbano **reemplaza** al oscuro/elegante del job 015 para **todas** las barberías. No hay selector de tema ni configuración por barbería.
2. La paleta es fija y sale del logo: **negro, blanco, azul royal (familia `#1F2E9A`) y rojo (familia `#D7191F`)**. El builder elige los valores exactos, siempre con buen contraste.

> **Es solo restyle visual de `/[slug]`.** Se mantienen las mismas secciones, los mismos datos y el mismo comportamiento. Todo lo que funcionaba con 013 y 015 tiene que seguir andando igual: la reserva por hora, el WhatsApp flotante, el lightbox de la galería, los horarios con "hoy", "Cómo llegar", el OG metadata y el 404.

## Contexto
- **Logo de referencia** (miralo con Read): `C:\Users\Lautaro\AppData\Local\Temp\claude\00a6c35373df7c12\f0272615-7873-4efc-99f7-7cd82eab537b\images\1.jpg`. Es "Lo de Fanty Barbershop" y tiene:
  - lettering blanco en brush/graffiti script con contorno negro grueso (look de **sticker**);
  - un poste de barbería con franjas diagonales azul royal, rojo y blanco;
  - una navaja con mango azul royal;
  - todo sobre **fondo blanco**.

  Los logos que suben las barberías probablemente sean así, sobre blanco. Por eso el logo tiene que verse "en casa": como un **sticker/badge blanco** con borde y sombra dura, no como un círculo recortado sobre negro.
- **Estado actual (job 015, en `main`).** Leé `factory/jobs/015-public-landing-redesign/spec.md` y `build.md`.
  - `src/app/[slug]/layout.tsx` carga **Bodoni Moda** (`--font-display`) y envuelve todo en `dark landing-theme`.
  - `src/app/[slug]/landing.css` pisa los tokens de shadcn con la paleta tabaco/latón (`.landing-theme.dark`), y tiene `.landing-leader` y `.landing-lightbox`. Es CSS global con prefijo `landing-`, importado solo desde el layout: un CSS module no sirve por la regla de Turbopack de `next.config.ts`.
  - `src/app/[slug]/ui.tsx` exporta `displayFont`, `container`, `focusRing` e `InstagramIcon`.
  - Secciones:
    - `hero.tsx`: portada con `next/image fill preload` + overlay, o hero tipográfico con monograma. El `Logo` es circular.
    - `services-section.tsx`: pizarra con línea punteada.
    - `gallery.tsx`: cliente, con `<dialog>` de lightbox.
    - `hours-section.tsx`: "hoy" con `aria-current="date"`.
    - `booking-section.tsx` y `booking-form.tsx`: solo cambian clases.
    - `floating-whatsapp.tsx`, `footer.tsx`, `not-found.tsx` y `page.tsx` (`SectionHeading`, orden de secciones, `generateMetadata`).
  - La lógica pura está en `landing-format.ts` y sus tests. **No cambia.**
- **Datos:** `getCachedBarbershop`, `getCachedLanding`, `getOnlineServices` y `getPublicOpeningHours`, todos sin cambios. Las imágenes subidas viven en `UPLOADS_DIR` (`./storage/uploads` del worktree, ignorado por git) y se sirven como `/media/<shopId>/<key>`. Los logos, la portada y la galería se suben desde el panel (`src/server/actions/landing.ts` y `barbershop.ts`).
- **Dirección de diseño (guía, no receta):** lenguaje de barbería urbana/streetwear.
  - **Tipografía display:** condensada y bold para los títulos (por ejemplo Anton, Bebas Neue u Oswald), en mayúsculas y con tracking ajustado.
  - **Script de acento:** brush/graffiti (por ejemplo Permanent Marker, Kaushan Script o Yellowtail), usado **con moderación**: una palabra o tag por sección como mucho, nunca en párrafos ni en controles.
  - **Stickers:** cards y botones con borde grueso y **sombra dura desplazada** (sin blur), con rotaciones leves (±1–3°) en tags y stickers.
  - **Franjas de barber pole:** diagonales azul, rojo y blanco como divisores de sección o como acento del hero.
  - **Textura:** grano o halftone sutil, solo con CSS o SVG inline (sin imágenes nuevas en `public/`).
  - Cuerpo: Geist, que ya está cargada.
- **Contraste de la paleta (cuidado):** el azul royal sobre negro (~1.7:1) y el rojo sobre negro (~4:1) **no pasan AA como texto**.
  - El azul y el rojo van como **superficies con texto blanco** (blanco/`#1F2E9A` ≈ 12:1, blanco/`#D7191F` ≈ 5:1) o como franjas y decoración.
  - Si hace falta texto de color sobre negro, usá tintes claros de la misma familia (por ejemplo un rojo o azul aclarado con ≥ 4.5:1).
  - Los tokens `--primary`, `--primary-foreground`, `--ring`, etc. se redefinen en `landing.css`, así `Button`/`Badge`/`Card` de shadcn heredan el estilo sin tocar `src/components/ui/**`.
- **Antes de diseñar**, cargá el skill `frontend-design:frontend-design` con la herramienta Skill.
- **Evaluá el look con datos reales en tu worktree:**
  1. Subí el logo de referencia como logo de `barberia-demo` en la DB/storage de tu worktree, desde el panel (`/dashboard/settings`) o replicando lo que hace la action: archivo en `UPLOADS_DIR` + `logoUrl` `/media/...`.
  2. Si sirve, sumá portada y fotos de galería de prueba.
  3. Dejá una barbería sin portada, galería ni redes para el fallback.
  4. Iterá con capturas de Chrome headless, en desktop (1366px) y en mobile (390px). Chrome headless en Windows no baja de ~500px de ventana, así que para mobile usá una página HTML local con un `<iframe>` de 390px de ancho dentro de una ventana más ancha.
  5. Guardá las capturas en el scratchpad, no en el repo.
- **Docs de Next 16** (en `node_modules/next/dist/docs/01-app/`): `03-api-reference/02-components/font.md` (múltiples fuentes, `subsets`, `display`, `adjustFontFallback`, variables CSS) y `03-api-reference/02-components/image.md`.

## Criterios de aceptación
- **AC-1 — Identidad urbana aplicada en todas las secciones.**
  - **Layout y fuentes:** `src/app/[slug]/layout.tsx` ya no carga Bodoni Moda. Carga, con `next/font/google`, una fuente display condensada bold y una fuente script/brush, expuestas como variables CSS en el wrapper.
  - **Subsets:** las dos fuentes cubren "á é í ó ú ñ ¡ ¿". Verificalo con una captura del h1 o tag con esos caracteres, sin glifos de fallback.
  - **Paleta:** `landing.css` define la paleta negro / blanco / azul royal / rojo como tokens y reemplaza a tabaco/latón. Un grep de `#c9a560`, `tabaco` y `laton` en `src/app/[slug]/` da 0 resultados.
  - **Elementos visibles en `/barberia-demo`:**
    - (a) títulos `h1` y `h2` en la display, en mayúsculas;
    - (b) al menos un acento en script/brush;
    - (c) franjas diagonales de barber pole (azul, rojo y blanco) como divisor o acento;
    - (d) CTAs y cards (servicios, horarios y pasos de reserva) con estilo sticker: borde grueso y sombra dura desplazada.

  Para verificarlo: capturas a 1366px y 390px adjuntas como rutas en `build.md`, más un grep de las clases y tokens.
- **AC-2 — El logo se ve como sticker.**
  - Con logo, el hero lo muestra en un **badge o sticker claro**: fondo blanco, borde negro grueso y sombra dura, con una rotación leve opcional. El logo se ve completo (`object-contain`, no recortado en círculo) y a un tamaño que se lee (≥ 96px en mobile).
  - Se mantienen las reglas de 015: `next/image` si es `/media/…` y `<img>` nativo si es externo.
  - Sin logo, las iniciales van en el mismo badge.
  - Verificación: captura con el logo de referencia subido como logo de `barberia-demo`.
- **AC-3 — Hero sin portada intencionalmente urbano.** Una barbería sin `coverUrl` muestra un hero compuesto, no vacío. Por ejemplo: franjas de barber pole, grano o halftone, tipografía display enorme y un tag en script. No muestra imágenes rotas ni un bloque negro liso. Con portada, el overlay mantiene el texto en AA. Verificación: capturas de los dos casos a 390px y 1366px.
- **AC-4 — Accesibilidad.**
  - **Contraste:** todo texto cumple AA (≥ 4.5:1 normal, ≥ 3:1 en display grande). Ningún texto de cuerpo va en azul royal ni en rojo puro sobre negro. Documentá en `build.md` los ratios de cada par texto/fondo usado (incluye botón primario, "hoy", precios y estados seleccionados de la reserva).
  - **Foco y táctil:** foco visible en todos los links y botones (también sobre superficies roja, azul y blanca). Áreas táctiles de ≥ 44px.
  - **Movimiento:** con `prefers-reduced-motion: reduce` no hay animaciones de entrada, rotaciones animadas ni smooth scroll. Las rotaciones **estáticas** están permitidas.
  - **Estructura:** un solo `h1` y `h2` por sección, igual que en 015.
  - **Layout:** sin scroll horizontal a 360px y 390px (`scrollWidth` == ancho). Las rotaciones y sombras no desbordan.
  - **Fuentes:** sin layout shift visible al cargar (`next/font`, con `adjustFontFallback` por defecto).
- **AC-5 — Comportamiento intacto (regresión de 013/015).** En `pnpm build && pnpm start` sobre tu worktree:
  - la reserva de punta a punta (`?service=…&date=…&time=…`, "Confirmar reserva") muestra "¡Listo! Tu turno quedó reservado" y crea el `Appointment`;
  - el lightbox abre, navega con ←/→, cierra con Escape o "Cerrar" y devuelve el foco;
  - el WhatsApp flotante se oculta con `#reservar` en pantalla;
  - "hoy" mantiene `aria-current="date"`;
  - los links externos conservan `target="_blank" rel="noopener noreferrer"`;
  - `og:title`, `og:description`, `og:type` y `og:image` siguen en el HTML;
  - un slug inexistente da 404 y `not-found` se ve con el estilo nuevo;
  - `/login` y `/dashboard` no cambian (el tema vive solo en el layout de `[slug]`).

  No se modifican la lógica, los `searchParams`, `landing-format.ts` ni `data.ts`.
- **AC-6 — Checks.** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan, sin dependencias nuevas (`package.json` intacto).

## Target Files (Scope)
- `src/app/[slug]/**` (layout con las fuentes nuevas, `landing.css`, `ui.tsx`, `hero.tsx`, `services-section.tsx`, `gallery.tsx`, `hours-section.tsx`, `booking-section.tsx`, `booking-form.tsx`, `floating-whatsapp.tsx`, `footer.tsx`, `not-found.tsx` y `page.tsx`; solo presentación)

## Fuera de alcance
- Selector de tema, colores o fuentes configurables por barbería, o mantener el tema elegante como opción.
- Tocar `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/**`, `next.config.ts`, el dashboard o `/login`.
- Dependencias nuevas: librerías de animación o de íconos, ni fuentes por npm (solo `next/font/google`). Tampoco imágenes o texturas nuevas en `public/`: el grano y las franjas se hacen con CSS o SVG inline.
- Cambiar textos, secciones, datos, queries, actions, `landing-format.ts` o la lógica de reserva y slots.
- Commitear el logo de referencia o las fotos de prueba: viven solo en el storage y la DB del worktree.

## Riesgos
- **Contraste:** el azul y el rojo de la marca no pasan AA como texto sobre negro. Se mitiga con AC-4 (superficies con texto blanco y ratios documentados).
- **Fuentes:** cargar una segunda fuente con `next/font` suma peso. Usá un solo peso por fuente cuando se pueda y el script solo en acentos. Puede haber layout shift si se usa mal.
- **Regresión visual o funcional del flujo de reserva** por el restyle: se mitiga con AC-5.
- **Desborde horizontal** en mobile por las rotaciones y sombras desplazadas: se mitiga con AC-4.
- Sin cambios de schema, auth, datos de otros tenants ni dinero.
