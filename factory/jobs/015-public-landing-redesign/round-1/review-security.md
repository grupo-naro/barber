VERDICT: PASS

## Hallazgos
- [nit] `src/app/[slug]/hero.tsx:29`: el logo va por `next/image` si `logoUrl.startsWith("/media/")`. Es seguro porque `localPatterns` (`/media/**`, `search: ""`) igual rechaza cualquier otra ruta en el optimizador, y hoy `logoUrl` solo se escribe vía `mediaUrl(key)`. Lo dejo anotado: no hay que relajar ese chequeo ni el patrón.
- [nit] `src/app/[slug]/page.tsx:384`: `openGraph.images` es relativo y, sin `metadataBase`, se resuelve contra la URL de fallback de Next. No filtra datos (es la portada pública), pero en producción puede apuntar a un host incorrecto. Ya está documentado en build.md como trabajo futuro.

## Revisado
- **Datos públicos.** Las queries por slug usan `select` explícito:
  - `getPublicBarbershop`: slug, nombre, logo, descripción, dirección, teléfono y WhatsApp **del negocio**, y zona horaria.
  - `getPublicLanding`: URLs derivadas, sin `barbershopId` ni `storageKey`.
  - `getPublicOpeningHours` (nueva): solo weekday/opensAt/closesAt/closed y `null` si el slug no existe. No expone el id del tenant.
  - Las dos hojas cliente (`Gallery` y `FloatingWhatsApp`) reciben solo `{id,url,alt}`, el nombre y el href. `PublicBarbershop` solo llega a componentes de servidor (Hero), así que no hay teléfonos de clientes ni datos internos en el payload RSC.
- **Render seguro.** No hay `dangerouslySetInnerHTML` en el diff. Todos los strings del dueño (nombre, descripción, dirección, alt, handle) se renderizan como texto de React.
- **Links externos.**
  - Instagram se arma con un handle validado por `/^[a-zA-Z0-9._]{1,30}$/`.
  - `mapsUrl` es un link `https:` de Google validado por `isGoogleMapsUrl` en la action, o el fallback `mapsSearchUrl` con `encodeURIComponent`.
  - WhatsApp es `https://wa.me/` + solo dígitos (`replace(/\D/g,"")`), y el `?text=` va con `encodeURIComponent`.
  - `tel:` va saneado a `[\d+]`.
  - Todos los links externos llevan `target="_blank"` y `rel="noopener noreferrer"` (hero, footer, horarios y flotante).
- **`next.config.ts`.** Solo agrega `images.localPatterns: [{ pathname: "/media/**", search: "" }]`. No hay `remotePatterns` ni `unoptimized`, así que el optimizador no queda como proxy abierto. Las imágenes de `/media` ya están validadas por magic bytes y tamaño.
- **Reserva (013).** `booking-form.tsx` y `booking-section.tsx` solo cambian estilos/estructura (`h2`→`h3`, clases, `id="reservar"` movido a la sección) y el `scrollIntoView` con reduced-motion. No se tocaron `actions/booking.ts`, `queries/booking.ts` ni `lib/slots.ts`, y el rate limit y la validación siguen intactos.
- **Metadata.** `generateMetadata` solo usa nombre, descripción y `coverUrl` públicos, y el 404 sigue igual.
