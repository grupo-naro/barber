# Contenido de la landing: fotos, portada, logo y redes (datos + panel)

**Pedido:** "Quiero que la página pública parezca más una landing, personalizada, donde el cliente (la barbería) pueda subir fotos de sus trabajos y compartir sus redes: Instagram, WhatsApp, Google Maps."

> Este job es **solo datos + panel**. El rediseño de `/[slug]` es el job 015, que va a consumir la función pública de lectura definida acá (AC-6). `/[slug]` se renderiza igual que hoy.

## Contexto
- `Barbershop` (prisma/schema.prisma) ya tiene `logoUrl` (URL externa escrita a mano en el perfil), `address`, `whatsapp`. No hay galería, portada ni Instagram/Maps.
- Panel: `/dashboard/settings` (`src/app/(dashboard)/dashboard/settings/page.tsx`, `requireRole("OWNER")`, cards con `ProfileForm`, `HoursForm`, `PayoutList`). Mutaciones en `src/server/actions/barbershop.ts` (patrón: Zod `safeParse` → `ownerSession()` → query con `session.barbershopId` → `updateTag(barbershopBrandingTag(slug))` + `revalidatePath`). Validación pura en `src/lib/barbershop-settings.ts` (`ActionResult`, `firstFieldErrors`, `normalizeWhatsapp`, `isHttpUrl`).
- Público: `src/app/[slug]/data.ts` → `getCachedBarbershop(slug)` con `"use cache"`, `cacheLife("minutes")`, `cacheTag(barbershopBrandingTag(slug))`; lee `getPublicBarbershop` de `src/server/queries/booking.ts`. `shop-header.tsx` pinta `logoUrl` con `<img>` nativo (una URL relativa `/media/...` funciona sin cambios).
- `src/proxy.ts`: el matcher `"/:slug([^/.]+)"` solo agarra paths de **un** segmento, así que `/media/<shopId>/<archivo>` no pasa por el chequeo de slug. `/media` suelto sí entra como candidato a slug → hay que agregar `"media"` a `RESERVED_SLUGS` (`src/lib/slugs.ts`) para que ninguna barbería pueda tomar ese slug. **No** hace falta tocar `src/proxy.ts`.
- `next.config.ts`: `cacheComponents: true`. Los Server Actions tienen límite de body de **1MB** por defecto.
- Docs que el builder tiene que leer en `node_modules/next/dist/docs/01-app/`: `01-getting-started/15-route-handlers.md`, `01-getting-started/07-mutating-data.md`, `01-getting-started/08-caching.md` y `09-revalidating.md` (`updateTag`), `02-guides/server-actions.md` (sección *Body size limit*), `03-api-reference/05-config/01-next-config-js/serverActions.md` (`bodySizeLimit`), `03-api-reference/03-file-conventions/route.md`, `02-guides/self-hosting.md`, `02-guides/data-security.md`.

### Decisiones de diseño (cerradas)
- **Almacenamiento:** disco local. Raíz = `path.resolve(process.env.UPLOADS_DIR ?? "./storage/uploads")`. Cada archivo vive en `<raíz>/<barbershopId>/<nombre>` con `nombre = <random de 32 hex de crypto.randomBytes>.<jpg|png|webp>` (extensión según los magic bytes, nunca según el nombre/MIME del cliente). En la DB se guarda la **key** relativa `<barbershopId>/<nombre>`; la URL pública es `/media/<key>`.
- **Servir:** route handler `src/app/media/[...path]/route.ts` (GET). Acepta exactamente 2 segmentos que matcheen `^[a-z0-9]{20,40}$` (id) y `^[a-f0-9]{32}\.(jpg|png|webp)$` (archivo); cualquier otra cosa → 404 sin tocar el disco. Además verifica que el path resuelto quede dentro de la raíz. Responde con `Content-Type` por extensión, `Cache-Control: public, max-age=31536000, immutable` (los nombres son aleatorios y nunca se reescriben) y `X-Content-Type-Options: nosniff`; 404 si no existe. No se usa `public/` (no sirve archivos agregados después del build).
- **Subida:** **Server Action con `FormData`** + `serverActions.bodySizeLimit: "4mb"` en `next.config.ts` (en `experimental.serverActions` o donde lo indique el doc instalado). Justificación: mantiene la convención del repo (mutaciones = Server Actions, sesión con `getSession`), hereda la protección CSRF/Origin de los Server Actions (un route handler la tendría que reimplementar) y el aumento es acotado: el cliente achica a ≤1600px antes de subir, y el servidor rechaza archivos > **3MB** igual.
- **Logo:** se sube con el mismo storage y se guarda en el `logoUrl` existente como `/media/<key>` (compatible: los `logoUrl` externos viejos siguen funcionando). El campo de texto "Logo (URL)" sale del `ProfileForm` y `updateBarbershopProfile` deja de escribir `logoUrl` (para que guardar el perfil no pise el logo subido).
- **Schema:** `Barbershop` suma `coverImageKey String?`, `instagram String?` (handle normalizado, sin `@`), `googleMapsUrl String?` y la relación `galleryImages`. Nuevo modelo `GalleryImage { id cuid, barbershopId (FK onDelete Cascade), storageKey String @unique, alt String?, sortOrder Int, createdAt }` con `@@index([barbershopId, sortOrder])`. Migración con `pnpm exec prisma migrate dev --name landing_content`.

## Criterios de aceptación
- **AC-1 — Validación pura (Vitest).** `src/lib/media.ts` exporta, sin Node fs ni Next: `detectImageType(bytes: Uint8Array): "jpg" | "png" | "webp" | null` por magic bytes (JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF????WEBP`), `MAX_UPLOAD_BYTES = 3 * 1024 * 1024`, `MAX_GALLERY_IMAGES = 24`, `parseMediaPath(segments: string[]): string | null` (devuelve la key solo con el formato de 2 segmentos descrito; `null` para `..`, `%2e%2e`, barras invertidas, segmentos extra, extensiones como `.svg`/`.gif`/`.html`), `mediaUrl(key)` y `fitWithin(w, h, max)` (dimensiones para el downscale, sin agrandar nunca). `src/lib/landing.ts` exporta `normalizeInstagram(raw)` (acepta `user`, `@user`, `instagram.com/user`, `https://www.instagram.com/user/?hl=es` → `"user"`; rechaza handles fuera de `^[a-zA-Z0-9._]{1,30}$` y hosts que no sean instagram.com), `isGoogleMapsUrl(raw)` (solo `https:` y host `google.com`/`www.google.com`/`maps.google.com` con path `/maps…`, `maps.app.goo.gl` o `goo.gl/maps`; rechaza `http:`, `javascript:`, `evil.com/?google.com`, `google.com.evil.com`), `mapsSearchUrl(address)` (`https://www.google.com/maps/search/?api=1&query=<encoded>`) y el `socialLinksSchema` Zod (instagram + googleMapsUrl, vacío → `null`, errores en español). Tests en `src/lib/media.test.ts` y `src/lib/landing.test.ts` cubren todos esos casos; `src/lib/slugs.test.ts` verifica que `media` es reservado.
- **AC-2 — Servir archivos.** `GET /media/<shopId>/<archivo>.webp` de un archivo existente responde 200 con `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000, immutable` y `X-Content-Type-Options: nosniff`. `GET /media/../.env`, `/media/%2e%2e/x.jpg`, `/media/a/b/c.jpg`, `/media/<shopId>/x.svg` y un archivo inexistente → 404. `GET /media` → 404 (slug reservado). Verificable con `curl -I` contra `pnpm build && pnpm start`.
- **AC-3 — Subida segura (galería, portada, logo).** Server Actions nuevas en `src/server/actions/landing.ts`: `uploadGalleryImage`, `setCoverImage`, `setLogoImage`. Orden: validar el `File` (existe, `size ≤ MAX_UPLOAD_BYTES`, `detectImageType` sobre sus bytes ≠ `null`; si no → `{ ok: false, error }` en español), después `ownerSession()` (un BARBER o sin sesión → `FORBIDDEN`, sin escribir nada en disco), después escribir en `<raíz>/<session.barbershopId>/` con nombre aleatorio (`mkdir -p`, `flag: "wx"`). La galería rechaza la subida número 25 ("Llegaste al máximo de 24 fotos") contando dentro de una transacción; si el insert falla, se borra el archivo escrito. Reemplazar portada o logo borra el archivo anterior si era una key `/media/` de **esa** barbería (un `logoUrl` externo viejo solo se reemplaza, no se toca el disco). Toda la IO de disco vive en `src/server/media-storage.ts` (`import "server-only"`), que solo acepta keys validadas y namespaced con el `barbershopId` de la sesión.
- **AC-4 — Editar, ordenar y borrar con aislamiento de tenant.** `updateGalleryImageAlt` (alt opcional, ≤ 150 chars), `moveGalleryImage` (arriba/abajo: intercambia `sortOrder` con el vecino de la misma barbería), `deleteGalleryImage` (borra la fila y el archivo; si el archivo ya no existe, igual borra la fila), `removeCoverImage`, `removeLogo`. Todas filtran con `where: { id, barbershopId: session.barbershopId }`: un id de otra barbería devuelve "No encontramos esa foto." y no modifica fila ni archivo. Las nuevas fotos entran al final (`max(sortOrder) + 1`).
- **AC-5 — Redes.** `updateSocialLinks` guarda `instagram` normalizado (`"@barber.ok"` → `barber.ok`) y `googleMapsUrl` (solo si pasa `isGoogleMapsUrl`; si no, error en el campo). El WhatsApp sigue editándose en el perfil (no se duplica el campo). Vacío → `null`.
- **AC-6 — Lectura pública para el job 015.** `src/server/queries/landing.ts` exporta `getPublicLanding(slug)` y `src/app/[slug]/data.ts` exporta `getCachedLanding(slug)` (`"use cache"`, `cacheLife("minutes")`, `cacheTag(barbershopBrandingTag(slug))`) que devuelve `null` si el slug no existe o `{ coverUrl: string | null, logoUrl: string | null, gallery: { id, url, alt }[] (orden sortOrder), instagram: { handle, url } | null, whatsappUrl: string | null ("https://wa.me/<dígitos>"), mapsUrl: string | null (googleMapsUrl, o mapsSearchUrl(address) si hay dirección, o null) }`. Solo campos públicos (sin `barbershopId` ni `storageKey` crudos). Toda action de AC-3/4/5 llama `updateTag(barbershopBrandingTag(session.barbershop.slug))` y `revalidatePath("/dashboard/settings")`. `/[slug]` no cambia visualmente.
- **AC-7 — Panel "Página pública".** En `/dashboard/settings` (solo OWNER, ya lo garantiza `requireRole`) aparece una card "Página pública" con: logo (preview + subir/quitar), portada (preview + subir/quitar), galería (grilla mobile-first con miniaturas, contador `n/24`, alt editable, botones ↑/↓ y borrar con confirmación, input de subida múltiple deshabilitado al llegar a 24) e Instagram + link de Google Maps (con ayuda: "si lo dejás vacío usamos tu dirección"). Antes de subir, el cliente achica cada imagen con `<canvas>` (`createImageBitmap` + `fitWithin(w, h, 1600)`, `canvas.toBlob` en `image/webp` calidad ~0.85, fallback `image/jpeg` si el navegador no codifica WebP); sin dependencias nuevas. Errores y estados de carga visibles, textos en español rioplatense. El `ProfileForm` ya no muestra el campo de URL del logo.
- **AC-8 — Infra y checks.** `.gitignore` ignora `/storage/`; `.env.example` documenta `UPLOADS_DIR` (default `./storage/uploads`) y que en producción (Docker/VPS) tiene que apuntar a un **volumen persistente** fuera de la imagen. `next.config.ts` tiene `bodySizeLimit: "4mb"`. `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan.

## Target Files (Scope)
- `prisma/schema.prisma`
- `prisma/migrations/**`
- `next.config.ts`
- `.gitignore`
- `.env.example`
- `src/lib/media.ts`
- `src/lib/media.test.ts`
- `src/lib/landing.ts`
- `src/lib/landing.test.ts`
- `src/lib/slugs.ts`
- `src/lib/slugs.test.ts`
- `src/lib/barbershop-settings.ts`
- `src/lib/barbershop-settings.test.ts`
- `src/server/media-storage.ts`
- `src/server/actions/landing.ts`
- `src/server/actions/barbershop.ts`
- `src/server/queries/landing.ts`
- `src/app/media/[...path]/route.ts`
- `src/app/[slug]/data.ts`
- `src/app/(dashboard)/dashboard/settings/**`

## Fuera de alcance
- Rediseño visual de `/[slug]` (hero, galería pública, botones de redes): es el job 015.
- Almacenamiento en S3/CDN, `next/image` con optimización, generación de thumbnails en el servidor, `sharp` o cualquier dependencia nueva.
- Drag & drop para ordenar (alcanza con ↑/↓), recorte de imágenes, videos, otras redes (TikTok, Facebook).
- Migrar los `logoUrl` externos existentes a disco.
- Tocar `src/proxy.ts` o `src/server/queries/booking.ts`.

## Riesgos
- **Cambio de schema + migración** (`GalleryImage`, campos nuevos en `Barbershop`) → requiere revisión humana.
- **Archivos subidos por usuarios:** path traversal, contenido no-imagen (SVG/HTML con scripts) y llenado de disco. Mitigado por magic bytes, whitelist jpg/png/webp, nombres aleatorios, regex estricta en el route handler, `nosniff`, tope de 3MB por archivo y 24 fotos por barbería.
- **Tenant isolation:** keys siempre construidas con `session.barbershopId`; todas las mutaciones filtran por él.
- **`bodySizeLimit` global a 4MB** aplica también a las actions públicas (reserva de turnos): aumento acotado, aceptado.
- **Despliegue:** sin volumen persistente para `UPLOADS_DIR`, las fotos se pierden al recrear el contenedor; con varias réplicas el disco local no se comparte (fuera de alcance, documentado).
- **Slug `media`** pasa a reservado: si alguna barbería existente lo usara, quedaría inaccesible (improbable; verificar en prod).
