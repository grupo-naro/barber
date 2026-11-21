# Build: 016-urban-landing-restyle
**Rama:** factory/016-urban-landing-restyle · **Commit:** 06295ad · **Worktree:** .worktrees/016-urban-landing-restyle

## Dirección
Estilo urbano tipo sticker y cartel de barrio, con la paleta del logo: tinta `#000`, tiza `#fff`, royal `#1f2e9a` y rojo `#d7191f`, más tintes claros para texto de color sobre negro (`--rojo-claro #ff6b70`, `--royal-claro #9aa6ff`).
- **Tipografía:**
  - Display: **Anton**, en mayúsculas.
  - Acento: **Kaushan Script**, con contorno negro grueso (`paint-order: stroke`) y sombra roja dura, como el lettering del logo. Va en un solo tag por pantalla: "Barbershop" en el hero y "Uy" en el 404, los dos `aria-hidden`.
  - Cuerpo: Geist.
- **Superficies por sección:** hero negro → servicios en "papel" blanco → trabajos en negro → horarios en royal → reserva en papel → footer negro. Cada superficie redefine los tokens de shadcn con `.landing-paper` o `.landing-royal`.
- **Lo memorable es el barber pole:**
  - Divisores de sección con franjas diagonales azul, blanco y rojo; el de debajo del hero "gira" con una animación `background-position` que solo corre sin reduced motion.
  - En el hero sin portada hay una banda gigante en diagonal, más una trama halftone y las iniciales en contorno.
- **Stickers:**
  - Borde de 3px y sombra dura desplazada sin blur (`.landing-sticker`, `.landing-btn`) en CTAs, cards de servicios, carta de horarios, pasos de la reserva, form, fotos y logo.
  - Rotaciones estáticas de ±1–6° en el logo, los precios, la fila "hoy", los números de paso y los tags.
- **Textura:** grano con SVG `feTurbulence` inline (sin archivos en `public/`).

## Qué cambió
- `src/app/[slug]/layout.tsx`: saca Bodoni Moda y carga Anton (`--font-display`) y Kaushan Script (`--font-script`) con `next/font/google`. Cada una con un peso y subset `latin`.
- `src/app/[slug]/landing.css`:
  - Tokens tinta/tiza/royal/rojo en lugar de tabaco/latón, y superficies `.landing-paper` y `.landing-royal`.
  - Foco global visible (`outline 3px var(--ring)` con offset).
  - Clases `.landing-display`, `.landing-tag`, `.landing-sticker`, `.landing-btn`, `.landing-lift`, `.landing-pole`, `.landing-pole-spin`, `.landing-grain`, `.landing-halftone`, `.landing-leader` y `.landing-lightbox`.
  - Sin transiciones ni animación con reduced motion.
- `src/app/[slug]/ui.tsx`: `displayFont` pasa a `.landing-display`. Suma `scriptTag` y `stickerButton`. `focusRing` delega en el CSS.
- `src/app/[slug]/hero.tsx`:
  - El logo va en un sticker blanco de 112px en mobile y 144px en desktop: `object-contain`, borde negro y sombra dura, `-rotate-3`. Usa `next/image` para `/media/…` e `<img>` para URLs externas; sin logo muestra las iniciales en el mismo badge.
  - Tag script y h1 Anton gigante con sombra royal.
  - CTAs sticker.
  - Sin portada: banda del poste, halftone e iniciales en contorno. El texto queda limitado al 60% para no pisar las franjas.
- `src/app/[slug]/page.tsx`: `SectionHeading` en Anton, `PoleDivider` entre secciones y superficies paper en servicios y reserva. No cambian el orden de las secciones, la metadata ni los datos.
- `src/app/[slug]/services-section.tsx`: cards sticker con el precio en un tag rojo girado y leader punteado.
- `src/app/[slug]/gallery.tsx`: miniaturas sticker con borde blanco y sombra roja o royal alternada. Los controles del lightbox también son sticker. La lógica no cambia.
- `src/app/[slug]/hours-section.tsx`: sección royal y carta de horarios blanca en sticker. "Hoy" es una tira roja con el texto blanco y conserva `aria-current="date"`. Suma el botón sticker "Cómo llegar".
- `src/app/[slug]/booking-section.tsx`: los pasos son cards sticker con el número en un bloque negro. Las opciones tienen borde de 2px y el seleccionado va rojo con sombra negra. Los skeletons usan `motion-safe:animate-pulse`.
- `src/app/[slug]/booking-form.tsx`: card sticker, títulos en display, inputs blancos de 44px y "Confirmar reserva" como botón sticker. La lógica no cambia.
- `src/app/[slug]/floating-whatsapp.tsx`: sticker redondo rojo con borde negro y sombra dura. La lógica de ocultarse no cambia.
- `src/app/[slug]/footer.tsx`: nombre en Anton y "Reservá online" en rojo claro.
- `src/app/[slug]/not-found.tsx`: franja del poste, "404" en display (con "Error" en `sr-only`), tag script y botón sticker.

`landing-format.ts`, `data.ts`, `format.ts`, los tests, `package.json` y todo lo que está fuera de `src/app/[slug]/` quedan sin tocar.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | **Layout:** carga `Anton` y `Kaushan_Script` y las expone como variables en el wrapper.<br>**Grep:** `grep -rn "c9a560\|tabaco\|laton" src/app/[slug]/` → 0 resultados.<br>**Glifos:** con un nodo de prueba inyectado en la página que tenía "¡¿Áé íóú Ñandú?!" y "¡¿Qué peñón, árbol útil?!", `CSS.getPlatformFontsForNode` de CDP devolvió **una sola** fuente por nodo: `Anton-Regular` (custom) y `KaushanScript-Regular` (custom), sin fallback. La captura está en el scratchpad (`glyphs.png`).<br>**Elementos (a–d):** h1/h2 en Anton y mayúsculas, tag script, franjas del poste y stickers en CTAs, servicios, horarios, pasos y form. Capturas: `.worktrees/016-urban-landing-restyle/tmp-ref/final-desktop.png` (1366, página completa) y `tmp-ref/final-mobile.png` (390, página completa). |
| AC-2 | ✅ | El logo de referencia está subido como logo de `barberia-demo` (archivo en `storage/uploads` del worktree + `logoUrl /media/…`). Se ve completo en un sticker blanco con borde negro de 3px, sombra dura y `-rotate-3`, de 112px en mobile. Sin logo (`otra-barberia`), las iniciales "OB" van en el mismo badge. Se mantienen `next/image` para `/media/` e `<img>` para URLs externas. |
| AC-3 | ✅ | `otra-barberia` no tiene portada, galería ni redes. Muestra una banda diagonal gigante del poste (animada solo con motion), halftone, grano, iniciales en contorno, Anton enorme y el tag script. Con portada, el overlay negro llega al 86–100% detrás del texto. Revisado a 390, 768 y 1366: en mobile la banda queda arriba a la derecha y en sm+ el texto se limita al 60%, sin texto sobre las franjas. Capturas en el scratchpad: `nocover-desktop.png` y `nocover-mobile.png`. |
| AC-4 | ✅ | **Contraste:** ver la tabla de abajo.<br>**Foco:** outline de 3px en `--ring` con offset 3px (blanco sobre negro y royal, negro sobre papel), verificado con Tab: `outline=rgb(255,255,255) solid 3px`.<br>**Táctil:** ningún link ni botón visible mide menos de 44px (script CDP → `[]`).<br>**Movimiento:** con reduce, `animationName` del poste = `none`, `scroll-behavior` = `auto` y las transiciones de los botones están anuladas.<br>**Estructura:** 1 `h1` y 4 `h2` (Servicios / Nuestros trabajos / Horarios y ubicación / Reservá tu turno).<br>**Layout:** `scrollWidth` = 360 y 390 en las dos barberías.<br>**Fuentes:** `next/font` con `adjustFontFallback` por defecto. |
| AC-5 | ✅ | Probado sobre `pnpm build && pnpm start -p 3001`:<br>**Reserva:** service → date → time → nombre y teléfono → "Confirmar reserva" muestra "¡Listo! Tu turno quedó reservado", y en la DB queda un `Appointment` PENDING del 2026-11-23 a las 13:00 para "Test Restyle".<br>**Lightbox:** abre con el foco en "Cerrar"; → pasa a "2 de 6" y ←← a "6 de 6"; Escape cierra y devuelve el foco a la miniatura que se estaba viendo; "Cerrar" también cierra y devuelve el foco.<br>**WhatsApp flotante:** `aria-hidden=true` con `#reservar` en pantalla.<br>**Hoy:** "hoy" tiene `aria-current="date"`.<br>**Links externos:** 7 de 7 con `rel="noopener noreferrer"`.<br>**OG:** `og:title`, `og:description`, `og:type` y `og:image` presentes.<br>**404:** `/no-existe-esta-barberia` → 404.<br>**Otras rutas:** `/login` 200 sin `landing-theme`; `/dashboard` 307 (sin sesión). |
| AC-6 | ✅ | Pasan los cuatro checks (ver abajo). `package.json` está intacto. |

**Nota sobre el 404:** un slug inexistente lo intercepta `src/proxy.ts`, que hace rewrite al `not-found` **global** (`src/app/not-found.tsx`, fuera de scope y sin cambios), igual que en 015. `[slug]/not-found.tsx` quedó restilizado (poste, display, sticker), pero solo se ve si la página misma llama a `notFound()`, así que no lo pude capturar con un slug inexistente.

### Contraste (texto/fondo)
| Par | Ratio |
|-----|-------|
| Blanco / negro (cuerpo, títulos) | 21:1 |
| Muted `#b5b5b5` / negro · / asfalto `#161616` | 8.33 · 7.17 |
| Botón primario: blanco / rojo `#d7191f` (también precios en tag, "hoy", slot y día seleccionados, badge "Elegido") | 5.19 |
| Rojo `#d7191f` / blanco (precio en las opciones de reserva) | 5.19 |
| Negro / blanco (papel, botones blancos, carta de horarios) | 21 |
| Muted `#4a4a4a` / blanco · / `#f2f2f2` (incluye "Cerrado") | 8.86 · 7.92 |
| Destructive `#b0151b` / blanco | 7.07 |
| Blanco / royal `#1f2e9a` (sección horarios) · muted `#dfe3ff` / royal | 10.96 · 8.65 |
| Rojo claro `#ff6b70` / negro ("Reservá online", íconos) | 7.59 |
| Tag "hoy": blanco / negro | 21 |

El royal y el rojo puros nunca van como texto sobre negro: solo como superficie, sombra o franja. El grano agrega un velo blanco del 9% como máximo (los ratios sobre royal y negro cambian menos de un 5%).

## Datos de prueba (no commiteados)
- `pnpm exec prisma db seed`.
- Con un script descartable (ya borrado), `barberia-demo` recibió:
  - el logo de referencia como logo;
  - una portada y 6 fotos de galería generadas (bokeh oscuro con Chrome headless);
  - Instagram y Maps.
- Todo vive en `storage/uploads/` del worktree y en `barber_job_016`.
- `otra-barberia` quedó sin portada, galería ni redes, para el fallback.
- `tmp-ref/` (excluido de git) solo tiene el logo y `final-desktop.png` / `final-mobile.png`.

## Checks
lint ✅ · typecheck ✅ · test ✅ (205/205) · build ✅

## Respuesta a la ronda 1
**Commit:** 06295ad

**Bloqueantes de code**
- `[blocking]` subsets: Anton y Kaushan Script cargan ahora con `subsets: ["latin", "latin-ext"]`. Siguen con `display: "swap"` y un solo peso.
- `[blocking]` `.landing-sticker-sm`: borré la regla, que era CSS muerto.

**Nits de code**
- Colores hardcodeados: quedan. Los valores son los de los tokens (`#000`/`#fff`); los de las superficies fijas, como la carta de horarios blanca, son intencionales.

**Nits de UI**
- Hero con portada: en `lg+` suma la banda del poste a la derecha, igual que el fallback sin portada. El texto se limita al 60% en `lg`, así que no pisa las franjas.
- Galería: pasa a 3 columnas en `md+` (6 fotos = 2 filas completas) y ajusté `sizes`.
- `--royal-claro`: lo borré porque no se usaba, y actualicé el comentario de contraste.
- Reserva: el título ya era `lg:sticky` (sin cambios).
- Texto de servicios: ya es `text-sm` (14px); el ~11px venía del escalado de la captura (sin cambios).
- `not-found` real: queda anotado como deuda, porque `src/proxy.ts` y `src/app/not-found.tsx` están fuera de scope.

**Nits de UX**
- CTA secundario "Escribinos por WhatsApp": ahora es oscuro con borde blanco y sombra royal, y "Reservar turno" (rojo) domina. `.landing-btn` toma el borde de `--sticker-edge`.
- WhatsApp flotante cerca de "Servicios": es un artefacto de la captura full-page, porque el botón es `position: fixed` (sin cambios).

**Re-verificación** (sobre `pnpm build && pnpm start -p 3001`)
- **Checks:** lint ✅ · typecheck ✅ · test ✅ (205/205) · build ✅ · `pnpm exec tsx scripts/booking-smoke.ts` OK.
- **Reserva:** reserva nueva de punta a punta con "¡Listo! Tu turno quedó reservado" y `Appointment` creado (2026-11-23 18:00 ART). Repetir el mismo turno muestra el error de la action con el estilo nuevo.
- **Lightbox:** las teclas ←/→ navegan, Escape y "Cerrar" cierran, y el foco vuelve a la miniatura.
- **WhatsApp flotante:** queda oculto mientras `#reservar` está en pantalla.
- **Reduced motion:** sin animación ni transiciones (`transitionDuration` = 0s).
- **Estructura y links:** 1 `h1`, 4 `h2`, "hoy" con `aria-current="date"` y 7 de 7 links externos con `rel` correcto.
- **Layout:** `scrollWidth` = 360 y 390, y ningún target mide menos de 44px.
- **Capturas:** actualicé `tmp-ref/final-desktop.png` y `tmp-ref/final-mobile.png`.
