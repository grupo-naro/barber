# Build: 015-public-landing-redesign
**Rama:** factory/015-public-landing-redesign · **Commit:** a297624 · **Worktree:** .worktrees/015-public-landing-redesign

## Diseño (skill frontend-design cargado)
- Paleta: tabaco `#17120e` (fondo), cuero `#211a15` (superficie), hueso `#efe8dc` (texto), ceniza `#ad9f8d` (secundario) y un solo acento latón `#c9a560`, que reemplaza `--primary`/`--ring` dentro del wrapper.
- Tipografía: **Bodoni Moda** (display de alto contraste, tipo dorado a la hoja de vidriera) para el nombre y los `h2`, con Geist para el cuerpo.
- Elementos con carácter: el nombre enorme en el hero (sin portada, el monograma gigante casi al tono del fondo hace de imagen) y los servicios como **pizarra de precios** (nombre, línea punteada y precio en latón).
- Movimiento: una sola entrada en el hero, solo con `motion-safe`.

## Qué cambió
- `src/app/[slug]/layout.tsx`: wrapper `dark landing-theme` con `bg-background text-foreground min-h-full flex-1` y la fuente display (`--font-display`).
- `src/app/[slug]/landing.css`: tokens del tema y acento (`.landing-theme.dark`, con más especificidad que `.dark`), smooth scroll solo con `no-preference`, la línea punteada y el `::backdrop` del lightbox. Es CSS global importado solo desde este layout y con selectores con prefijo. Lo usé en vez de un CSS module porque la regla de Turbopack `*.css` de `next.config.ts` rompe el `:global()` en los modules.
- `src/app/[slug]/page.tsx`: orden hero → servicios → galería → horarios/ubicación → reserva (`<section id="reservar">`) → footer → botón flotante de WhatsApp. `generateMetadata` suma `openGraph`. `generateStaticParams` e `instant` quedan igual.
- `src/app/[slug]/hero.tsx` (nuevo; reemplaza `shop-header.tsx`, que se borró): portada con `next/image fill preload sizes="100vw"` y overlay, o hero tipográfico. Logo con `next/image` si es `/media/…` y `<img>` si es externo. CTAs "Reservar turno" (`#reservar`) y WhatsApp (solo si hay), más el @ de Instagram.
- `src/app/[slug]/services-section.tsx` (nuevo): pizarra de precios con `connection()` y `getOnlineServices`. Cada ítem linkea a `bookingHref(slug,{service})#reservar`. Tiene el vacío "Por ahora no hay servicios…".
- `src/app/[slug]/gallery.tsx` (nuevo, client): grilla de 2/3/4 columnas con `next/image` lazy y `sizes` acordes. Lightbox con `<dialog>` nativo: Escape y "Cerrar" (con autofocus) lo cierran, ←/→ navegan y el foco vuelve a la miniatura.
- `src/app/[slug]/hours-section.tsx` (nuevo): horarios de lunes a domingo, con "hoy" (`weekdayOf(businessDate(now, tz))`) en latón y `aria-current="date"`, dentro de `<Suspense>` + `connection()`. También dirección, "Cómo llegar" y teléfono. Si no hay horarios queda solo la ubicación, y si no hay nada se oculta.
- `src/app/[slug]/floating-whatsapp.tsx` (nuevo, client): botón flotante de 56px, `md:hidden`, con `env(safe-area-inset-bottom)`. Un `IntersectionObserver` lo oculta (y lo saca del tab order) mientras `#reservar` está en pantalla.
- `src/app/[slug]/footer.tsx` (nuevo): nombre, dirección, "Reservá online" y redes, cada una solo si existe.
- `src/app/[slug]/ui.tsx` (nuevo): clases compartidas (display, contenedor, foco) y un ícono SVG propio de Instagram.
- `src/app/[slug]/landing-format.ts` + `.test.ts` (nuevos): `whatsappMessageUrl`, `weeklyHours`, `hasOpeningHours` e `initials`, con 8 tests.
- `src/app/[slug]/booking-section.tsx`: solo presentación. Steps en `h3` (el `h2` es "Reservá tu turno"), número en latón, márgenes del scroll de días y foco visible en los servicios. Se sacó `id="reservar"` del div, porque ahora lo tiene la `<section>` de la página. Mismos `searchParams`, `scroll={false}` y queries.
- `src/app/[slug]/booking-form.tsx`: `scrollIntoView` usa `behavior: "auto"` con `prefers-reduced-motion: reduce`. El resto no cambia.
- `src/app/[slug]/not-found.tsx`: título en display y área táctil de 44px (hereda el oscuro del layout).
- `src/server/queries/landing.ts`: se agregó `getPublicOpeningHours(slug)` (`{weekday,opensAt,closesAt,closed}[]`, sin caché).
- `next.config.ts`: `images.localPatterns: [{ pathname: "/media/**", search: "" }]`. Antes lo verifiqué con grep: ninguna otra pantalla usaba `next/image`.

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | En `pnpm start`, `/barberia-demo` muestra h1 → h2 Servicios → Nuestros trabajos → Reservá tu turno → Horarios y ubicación (este último entra por streaming y queda en el DOM antes de la reserva) → footer. Capturas con Chrome headless a 360, 390 y 1366: `scrollWidth` = 360/390, sin scroll horizontal. Barbería sin portada, galería, redes, dirección, horarios ni servicios (dejé `otra-barberia` así en la DB del job): 0 "Cómo llegar", 0 "Nuestros trabajos", 0 `wa.me`, 0 `instagram.com`, 0 `_next/image`, sin sección de horarios, con "Por ahora no hay servicios para reservar online." y el hero tipográfico con monograma. |
| AC-2 | ✅ | La portada sale como `<img … sizes="100vw" src="/_next/image?url=%2Fmedia%2F…">` con `<link rel="preload" as="image">`. `GET /_next/image?url=/media/<key>&w=640&q=75` → 200 `image/jpeg`. `url=/favicon.ico` → 400 y `/media/<key>?x=1` → 400. Galería con `loading="lazy"` y alt cargado o "Trabajo de Barbería Demo". Lightbox probado por CDP a 390px: abrir enfoca "Cerrar" y muestra "2 de 7", → pasa a "3 de 7", ←← a "1 de 7", Escape cierra y el foco vuelve a la miniatura, y el botón "Cerrar" también cierra. |
| AC-3 | ✅ | WhatsApp: `https://wa.me/549…?text=Hola%20Barber%C3%ADa%20Demo!%20Quer%C3%ADa%20consultar%20por%20un%20turno.` Instagram muestra `@barberiademo`. "Cómo llegar" va a `mapsUrl` junto a la dirección. Todos los `target="_blank"` llevan `rel="noopener noreferrer"` (0 sin rel en el HTML). Los botones que son solo ícono (flotante, ←/→) tienen `aria-label`. Tests puros: encoding (acentos, `&`, `?`), link nulo, orden lunes→domingo, "Cerrado" (sin fila, `closed`, horas incompletas) y marca de hoy. |
| AC-4 | ✅ | "HH:mm – HH:mm" o "Cerrado". Hoy (sábado en la zona de la barbería) sale con `aria-current="date"`, `bg-primary/10 text-primary` y la marca "hoy". Corre en `<Suspense>` + `connection()`, sin caché. |
| AC-5 | ✅ | Por `--dump-dom` y CDP: con `#reservar` en pantalla el botón tiene `opacity-0 pointer-events-none`, `aria-hidden` y `tabindex=-1`; arriba de la página está visible. Mide `size-14` (56px), es `md:hidden` y usa `bottom: calc(1rem + env(safe-area-inset-bottom))`. |
| AC-6 | ✅ | En `pnpm start`, Chrome (CDP, 390px) en `/barberia-demo?service=…&date=2026-11-23&time=13:00`: completé el formulario y "Confirmar reserva" mostró "¡Listo! Tu turno quedó reservado", con el `Appointment` creado en la DB. Con el envío sin JS (multipart a la action) también se crearon los turnos (73→74…), y con el horario lleno la página muestra "Ese horario ya no está disponible". No se tocaron `src/server/actions/booking.ts`, `src/server/queries/booking.ts` ni `src/lib/slots.ts`, y los tests de slots y booking siguen en verde. |
| AC-7 | ✅ | `/login` → 200, sin `landing-theme` (el tema vive solo en el layout de `[slug]`; no se tocaron `globals.css` ni `layout.tsx` raíz). Contraste: hueso/tabaco ≈ 15:1, ceniza/tabaco ≈ 6.8:1, latón/tabaco ≈ 8:1, tabaco sobre latón (botón) ≈ 8:1, y sobre la portada el overlay es ≥ 88% del fondo detrás del texto. El foco es visible (`ring` latón) y las áreas táctiles miden ≥ 44px (`min-h-11`, `h-12`). Hay `motion-safe` en la entrada y en las transiciones, y smooth scroll solo con `no-preference`. Headings: un solo `h1` (el nombre), `h2` por sección y `h3` en los pasos. OG: `og:title`, `og:description`, `og:type=website` y `og:image` (con portada). El slug inexistente sigue dando 404. |
| AC-8 | ✅ | Ver Checks. Sin dependencias nuevas (`package.json` intacto). |

## Notas
- **`openGraph.images` relativo:** como no hay `metadataBase` (fuera de alcance), Next lo resuelve contra la URL de fallback (en local sale `http://localhost:3001/media/…`). En producción conviene definir `metadataBase` en un job futuro.
- **DB del job (`barber_job_015`):** para verificar, `barberia-demo` tiene portada, 7 fotos de prueba (en `storage/` del worktree, ignorado por git) e Instagram, más 6 turnos "Curl Tester" / "Browser Tester". `otra-barberia` quedó sin WhatsApp, dirección, redes, horarios ni servicios activos. `pnpm exec prisma db seed` la restaura.
- Las capturas quedaron en el scratchpad, fuera del repo.

## Checks
lint ✅ · typecheck ✅ · test ✅ (205/205) · build ✅
