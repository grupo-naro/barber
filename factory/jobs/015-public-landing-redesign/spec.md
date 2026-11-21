# Rediseño de la página pública como landing (oscura y elegante)

**Pedido:** "Poner más linda la página pública, que parezca una landing, personalizada por barbería, con fotos de sus trabajos y sus redes (Instagram, WhatsApp, Google Maps)."

**Decisiones del dueño (cerradas):** estética **oscura y elegante**: fondo oscuro, portada grande, tipografía con carácter y **un solo color de acento**, con look de barbería moderna. Redes: Instagram, WhatsApp y Google Maps.

> Este job es **solo presentación** de `/[slug]`. Los datos ya existen (job 014). La lógica de reserva por hora (job 013) tiene que seguir funcionando **igual**: mismos `searchParams` (`service`, `date`, `time`), la misma action `bookAppointment` y las mismas queries.

## Contexto
- **Página actual:** `src/app/[slug]/page.tsx` es un `main` angosto (`max-w-xl`) con `ShopHeader` (`shop-header.tsx`: logo con `<img>`, nombre, dirección, descripción, botones Reservar/WhatsApp/teléfono) y `<Suspense><BookingSection/></Suspense>`.
  - `booking-section.tsx` (Server, `connection()`) arma los pasos 1-3 con `<Link scroll={false}>` y `bookingHref`.
  - `booking-form.tsx` (Client) usa `useActionState(bookAppointment)`.
  - `format.ts` tiene `formatPrice`, `formatDuration`, `formatDay*` y `bookingHref`.
  - `generateMetadata` arma el título y la descripción desde `getCachedBarbershop`.
  - `generateStaticParams` con placeholder y `instant = false` dan un 404 real. **No se tocan.**
- **Datos disponibles:**
  - `getCachedBarbershop(slug)` devuelve `name`, `description`, `address`, `phone`, `whatsapp`, `logoUrl` y `timezone`.
  - `getCachedLanding(slug)` (en `src/app/[slug]/data.ts`, `"use cache"` con el tag de branding) devuelve `{ coverUrl, logoUrl, gallery: {id,url,alt}[], instagram: {handle,url} | null, whatsappUrl ("https://wa.me/<dígitos>") | null, mapsUrl | null }`. `mapsUrl` ya cae a `mapsSearchUrl(address)`.
  - `getOnlineServices(slug)` está en `src/server/queries/booking.ts`.
  - Horarios: modelo `OpeningHours` (`weekday` 0=domingo…6, `opensAt`/`closesAt` "HH:mm", `closed`). **No hay lectura pública semanal.** Hay que agregar `getPublicOpeningHours(slug)` en `src/server/queries/landing.ts`: resuelve el tenant por slug y devuelve solo `{ weekday, opensAt, closesAt, closed }[]`. **No la cachees con el tag de branding**, porque `updateOpeningHours` no invalida ese tag. Se lee por request dentro de un `<Suspense>` (también hace falta así para saber qué día es "hoy").
- **Imágenes:**
  - `coverUrl` y `gallery[].url` son `/media/<shopId>/<32hex>.(jpg|png|webp)`, servidas por `src/app/media/[...path]/route.ts` con `Cache-Control: immutable`. Son locales, así que `next/image` las optimiza sin `remotePatterns` (`sharp` ya está en `node_modules` como dependencia de Next).
  - `logoUrl` puede ser `/media/...` o una **URL externa vieja**: si es externa se mantiene el `<img>` nativo (o `next/image` con `unoptimized`), y no se agrega `remotePatterns`.
  - Hay que agregar `images.localPatterns: [{ pathname: "/media/**", search: "" }]` en `next.config.ts`, así el optimizador solo acepta `/media/**` sin query string (en `public/` no hay imágenes que se rompan).
- **Tema:**
  - `globals.css` define tokens claros en `:root` y oscuros en `.dark`, con `@custom-variant dark (&:is(.dark *))`.
  - El tema oscuro se aplica **solo** a `/[slug]` con un `src/app/[slug]/layout.tsx` nuevo, que envuelve a los children en un contenedor con clase `dark`, `bg-background text-foreground`, `min-h-full flex-1` y las variables del acento (definidas inline o en un CSS module de `[slug]`).
  - **No se tocan** `src/app/layout.tsx` ni `globals.css`, y el dashboard queda igual.
  - El acento (por ejemplo latón/dorado o ámbar) se define como token propio del layout y reemplaza a `--primary`/`--ring` dentro del wrapper. Así los `Button`/`Badge` de shadcn lo heredan sin modificar `src/components/ui/**`.
  - La fuente display para títulos se carga con `next/font/google` en ese layout (variable CSS aplicada al wrapper). Cuerpo: Geist (ya cargada).
  - `not-found.tsx` también hereda el layout, así que tiene que verse bien en oscuro.
- **Antes de diseñar**, el builder carga el skill `frontend-design:frontend-design` con la herramienta Skill para evitar un template genérico.
- **Docs de Next 16 que tiene que leer** (en `node_modules/next/dist/docs/01-app/`):
  - `03-api-reference/02-components/image.md` (`sizes`, `preload`/`priority`, `fill`, `localPatterns`)
  - `03-api-reference/02-components/font.md`
  - `03-api-reference/03-file-conventions/layout.md`
  - `03-api-reference/04-functions/generate-metadata.md` (`openGraph.images`, `metadataBase`)
  - `01-getting-started/08-caching.md`
  - `03-api-reference/03-file-conventions/02-route-segment-config/`

## Criterios de aceptación
- **AC-1 — Estructura de landing, mobile-first.** `/barberia-demo` muestra en orden:
  1. **Hero.** Portada a todo el ancho con overlay oscuro (si no hay portada, un hero tipográfico elegante sin imagen rota). Logo (o iniciales), nombre con la fuente display, descripción corta, CTA primario "Reservar turno" (ancla a `#reservar`) y CTA secundario WhatsApp (solo si hay `whatsappUrl`).
  2. **Servicios.** Nombre, precio en ARS con `formatPrice` y duración. Cada uno es un link que preselecciona el servicio en la reserva (`bookingHref` + `#reservar`).
  3. **Galería "Nuestros trabajos".**
  4. **Horarios + ubicación.**
  5. **Reserva.** El flujo existente, restyled.
  6. **Footer.** Nombre, redes, dirección y "Reservá online".

  Se ve sin scroll horizontal a 360px y aprovecha el ancho en desktop. Cada sección degrada bien si falta su dato:
  - sin galería, no hay sección de galería;
  - sin servicios online, la sección muestra el texto actual "Por ahora no hay servicios…" (o se oculta) y la reserva sigue mostrando su vacío;
  - sin dirección ni `mapsUrl`, no aparece "Cómo llegar";
  - sin Instagram/WhatsApp, no hay botones rotos.

  Para verificarlo: `pnpm build && pnpm start`, y `curl` + HTML en la barbería demo (con todos los datos) y en una barbería sin portada, galería ni redes.
- **AC-2 — Galería e imágenes.** La galería es una grilla responsive (2 columnas en mobile, 3-4 en desktop) con `next/image` (`sizes` acorde a la grilla, lazy por defecto). El `alt` de cada foto sale del alt cargado, con fallback "Trabajo de <nombre>". Tocar una foto la amplía en un lightbox, **sin dependencias nuevas**: `<dialog>` nativo o similar, que cierre con Escape y con un botón "Cerrar" de foco visible, devuelva el foco a la miniatura y, opcionalmente, navegue con ←/→. Si no se puede hacer accesible, se omite el lightbox (es opcional). La portada usa `next/image` con `fill` + `priority`/`preload` y `sizes="100vw"`: es el LCP. Verificación:
  - el HTML de la portada sale como `/_next/image?url=%2Fmedia%2F…`;
  - `GET /_next/image?url=/media/<key>&w=640&q=75` → 200;
  - una URL fuera de `/media/**` o con query → 400.
- **AC-3 — Redes y ubicación.**
  - **Instagram:** link a `instagram.url` con el `@handle` visible.
  - **WhatsApp:** `whatsappUrl` + `?text=` con un mensaje precargado codificado (por ejemplo "Hola <nombre>! Quería consultar por un turno.").
  - **"Cómo llegar":** link a `mapsUrl`, junto con la dirección.
  - Todos los externos llevan `target="_blank" rel="noopener noreferrer"` y `aria-label` cuando el botón es solo ícono.
  - El armado del link de WhatsApp con texto y el de los horarios semanales son **funciones puras** en `src/app/[slug]/landing-format.ts`, con tests de Vitest en `src/app/[slug]/landing-format.test.ts`. Los tests cubren:
    - el encoding del texto (acentos, `&`, `?`);
    - el link nulo cuando falta WhatsApp;
    - el orden lunes→domingo;
    - los días cerrados o sin cargar ("Cerrado");
    - la marca del día de hoy dado un weekday.
- **AC-4 — Horarios con "hoy".** Los horarios se ven lunes→domingo como "HH:mm – HH:mm" o "Cerrado". El día de hoy, calculado con `businessDate(new Date(), shop.timezone)` + `weekdayOf`, nunca con `getDay()` local, queda resaltado con el acento y lleva `aria-current="date"`. Esto vive dentro de un `<Suspense>` con `connection()`. Si la barbería no cargó horarios, la sección muestra solo la ubicación o se oculta.
- **AC-5 — Botón flotante de WhatsApp (mobile).** Si hay WhatsApp, en mobile (`< md`) aparece un botón flotante abajo a la derecha, al alcance del pulgar (≥ 48px, `aria-label`, respeta `env(safe-area-inset-bottom)`). **Se oculta mientras la sección `#reservar` está en pantalla**, así nunca tapa "Confirmar reserva" ni los horarios. Esa es la única hoja cliente nueva y usa `IntersectionObserver`. En desktop no aparece (el WhatsApp está en el hero y el footer).
- **AC-6 — La reserva no cambia.** El flujo de pasos 1-3 + formulario sigue andando igual: mismos `searchParams`, `scroll={false}`, `bookAppointment`, la confirmación "¡Listo! Tu turno quedó reservado" y el aviso "Ese horario ya no está disponible". Solo cambian clases y estilos para que se integren al tema oscuro. No se modifican `src/server/actions/booking.ts`, `src/server/queries/booking.ts` ni `src/lib/slots.ts`. Verificación: en `pnpm start`, reservar un turno de punta a punta en `/barberia-demo?service=…&date=…&time=…` crea el `Appointment`, y los tests existentes de slots y booking siguen en verde.
- **AC-7 — Tema, accesibilidad y SEO.**
  - El oscuro solo vive en `/[slug]`: `/dashboard` y `/login` se ven igual que antes.
  - El texto cumple contraste AA sobre fondo oscuro, incluso sobre la portada con overlay.
  - Foco visible en todos los links y botones, y áreas táctiles de ≥ 44px.
  - Respeta `prefers-reduced-motion` (sin animaciones de entrada ni smooth scroll si está activo).
  - Jerarquía de headings: un solo `h1` (el nombre) y `h2` por sección.
  - `generateMetadata` suma `openGraph` (title, description, `images: [coverUrl]` si hay portada, `type: "website"`) sin romper el 404 de slugs inexistentes.
- **AC-8 — Checks.** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan, sin dependencias nuevas.

## Target Files (Scope)
- `src/app/[slug]/**` (incluye `layout.tsx` nuevo, `landing-format.ts`, `landing-format.test.ts` y componentes nuevos de secciones, galería y botón flotante)
- `src/server/queries/landing.ts` (solo agrega `getPublicOpeningHours`)
- `next.config.ts` (solo `images.localPatterns`)

## Fuera de alcance
- Cambios en `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/**` o el tema del dashboard.
- Dependencias nuevas: librerías de lightbox o carrusel, framer-motion, íconos de marca. Para Instagram se usa lucide o un SVG inline propio.
- Lógica de reserva, slots, la action `bookAppointment` y el panel `/dashboard/settings`.
- Colores de acento configurables por barbería, otras redes (TikTok, Facebook), mapa embebido (iframe de Google Maps), reseñas.
- `metadataBase` o variable de entorno de URL pública nuevas. Si `openGraph.images` relativo queda con la URL de fallback de Next, se documenta en `build.md`.
- Invalidar caché desde `updateOpeningHours`: los horarios se leen sin caché.

## Riesgos
- **`next.config.ts` → `images.localPatterns`:** cambia la config global del optimizador de imágenes. Hoy ninguna otra pantalla usa `next/image` con rutas locales: verificarlo con `grep` antes.
- **Optimizador de imágenes sobre `/media`:** el servidor procesa imágenes subidas por usuarios (ya validadas por magic bytes y con un tope de 3MB/1600px). Queda acotado a `/media/**` sin query.
- **Regresión del flujo de reserva** (job 013) por el restyle: se mitiga con AC-6.
- Sin cambios de schema, auth ni dinero. Ningún dato nuevo expuesto más allá de los horarios semanales, que son públicos.
