VERDICT: PASS

## Hallazgos
- [nit] `src/app/[slug]/gallery.tsx` (`{index! + 1} de ...`): el `!` es seguro porque `current` solo existe si `index !== null`, pero se evita derivando `index + 1` dentro de un guard sobre `index` en vez de `current`.
- [nit] `ServicesList` (`services-section.tsx`) y `BookingSection` llaman ambos a `getOnlineServices(slug)` por request. Es una query duplicada, aunque cada una está en su propio `<Suspense>` con `connection()` como pide el spec. Se podría compartir con `React.cache` más adelante.
- [nit] `hours-section.tsx`: si hay ubicación pero ningún día abierto, el título es "Dónde estamos". Es coherente con el spec; solo se deja constancia.

## Revisado
- Server vs client: solo `gallery.tsx` (lightbox con `<dialog>`) y `floating-whatsapp.tsx` son `"use client"`. `booking-form.tsx` ya lo era. El resto de las secciones son Server Components.
- Caché: `generateMetadata` y la página reutilizan `getCachedBarbershop` y `getCachedLanding` (`"use cache"` + `cacheLife` + `cacheTag(barbershopBrandingTag)`). Horarios y servicios se leen por request dentro de `<Suspense>` con `connection()`, como pide el spec. No hay llamadas a la DB fuera de caché en la ruta de render principal.
- `next/image`: el hero usa `fill`, `preload` y `sizes="100vw"`, y es la única imagen con `preload`. La galería usa `sizes` acorde a la grilla y carga lazy. `images.localPatterns: [{ pathname: "/media/**", search: "" }]` es correcto para Next 16. Un logo externo cae a `<img>` nativo, sin `remotePatterns`.
- `generateMetadata`: agrega `openGraph` (title, description, type, `images` condicional a `coverUrl`) y devuelve el título "Barbería no encontrada" si no hay shop.
- Zona horaria: "hoy" sale de `weekdayOf(businessDate(new Date(), timeZone))`, sin `getDay()` local. `weeklyHours` es una función pura con tests en `landing-format.test.ts`.
- `next/font`: `Bodoni_Moda` se carga solo en `[slug]/layout.tsx`. El tema oscuro está acotado a ese wrapper.
- `landing.css`: se importa solo desde ese layout. Los selectores globales (`html:has(.landing-theme)`, `body:has(.landing-theme)`) están condicionados a `.landing-theme`, y las clases propias usan el prefijo `landing-`. No filtra al dashboard.
- Código muerto: `shop-header.tsx` fue borrado y no queda ninguna referencia a `ShopHeader`.
- TS estricto: sin `any`, sin `@ts-ignore`. Único `!` es el del nit 1.
- Scope: los archivos cambiados son `src/app/[slug]/**`, `src/server/queries/landing.ts` (solo agrega `getPublicOpeningHours`, con `select` acotado y una sola query) y `next.config.ts` (solo `images.localPatterns`). Todos dentro del scope.
- Reserva: `scripts/booking-smoke.ts` termina en OK. Los cambios en `booking-form.tsx` y `booking-section.tsx` son solo de estilos, headings y `prefers-reduced-motion`.
- lint ✅ · typecheck ✅ · test ✅ · build ✅ (corridos en cadena `&&`; `/[slug]` queda en Partial Prerender) · scope ✅ · AC-1..AC-8 ✅ por lectura de código. No levanté el servidor, así que los puntos que piden `curl` sobre `/_next/image` (200 dentro de `/media`, 400 fuera) no están verificados en vivo.
