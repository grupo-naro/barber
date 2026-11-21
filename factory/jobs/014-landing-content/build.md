# Build: 014-landing-content
**Rama:** factory/014-landing-content · **Commit:** dcdf8aa · **Worktree:** .worktrees/014-landing-content

## Qué cambió
- `prisma/schema.prisma`: `Barbershop` suma `coverImageKey`, `instagram`, `googleMapsUrl` y `galleryImages`; nuevo modelo `GalleryImage` (FK cascade, `storageKey @unique`, `@@index([barbershopId, sortOrder])`).
- `prisma/migrations/20261121030811_landing_content/migration.sql`: migración `landing_content` (solo ADD COLUMN nullable + CREATE TABLE, no destructiva).
- `next.config.ts`: `experimental.serverActions.bodySizeLimit: "4mb"`.
- `.gitignore`: ignora `/storage/`.
- `.env.example`: documenta `UPLOADS_DIR` (default `./storage/uploads`, volumen persistente en producción, sin compartir entre réplicas).
- `src/lib/media.ts`: `detectImageType`, `MAX_UPLOAD_BYTES`, `MAX_GALLERY_IMAGES`, `parseMediaPath`/`parseMediaKey`, `mediaUrl`, `mediaKeyFromUrl` (solo keys `/media/` de ESA barbería), `fitWithin`, content types. Puro.
- `src/lib/media.test.ts`: magic bytes, traversal (`..`, `%2e%2e`, `\`, segmentos extra, svg/gif/html, mayúsculas), `mediaKeyFromUrl`, `fitWithin`.
- `src/lib/landing.ts`: `normalizeInstagram`, `instagramUrl`, `isGoogleMapsUrl`, `mapsSearchUrl`, `whatsappUrl`, `socialLinksSchema`, schemas de alt/move/id de la galería. Puro.
- `src/lib/landing.test.ts`: todos los casos del AC-1 (incluye `evil.com/?google.com`, `google.com.evil.com`, `http:`, `javascript:`).
- `src/lib/slugs.ts` / `slugs.test.ts`: `media` pasa a ser slug reservado y tiene test.
- `src/lib/barbershop-settings.ts` / `.test.ts`: `profileSchema` ya no tiene `logoUrl` (tests actualizados).
- `src/server/actions/barbershop.ts`: `updateBarbershopProfile` ya no lee ni escribe `logoUrl`.
- `src/server/media-storage.ts` (`server-only`): toda la IO de disco (`saveImage` con `randomBytes(16)` + `flag: "wx"`, `deleteImage`, `deleteImageQuietly`, `readImage`, `isKeyOfShop`). Solo keys validadas, chequeo de que el path resuelto quede dentro de la raíz, `node:path`. Lleva comentarios `turbopackIgnore` para que el build no trace todo el proyecto.
- `src/server/actions/landing.ts`: `uploadGalleryImage`, `setCoverImage`, `setLogoImage`, `removeCoverImage`, `removeLogo`, `updateGalleryImageAlt`, `moveGalleryImage`, `deleteGalleryImage`, `updateSocialLinks`.
- `src/server/queries/landing.ts`: `getPublicLanding(slug)` (AC-6) y `getLandingSettings(barbershopId)` para el panel.
- `src/app/media/[...path]/route.ts`: GET que sirve los archivos (además manda `Content-Security-Policy: default-src 'none'; sandbox` como defensa extra).
- `src/app/[slug]/data.ts`: `getCachedLanding(slug)` (`"use cache"`, `cacheLife("minutes")`, tag de branding).
- `src/app/(dashboard)/dashboard/settings/page.tsx`: card "Página pública".
- `src/app/(dashboard)/dashboard/settings/landing-form.tsx`: UI de logo, portada, galería (n/24, alt, ↑/↓, borrado con confirmación en dos pasos, subida múltiple) y redes.
- `src/app/(dashboard)/dashboard/settings/resize-image.ts`: downscale en el cliente (`createImageBitmap` + `fitWithin(…,1600)` + `canvas.toBlob` WebP 0.85, fallback JPEG).
- `src/app/(dashboard)/dashboard/settings/profile-form.tsx`: saqué el campo "Logo (URL)".

## Criterios de aceptación
| AC | Estado | Evidencia |
|----|--------|-----------|
| AC-1 | ✅ | `pnpm test`: `media.test.ts`, `landing.test.ts`, `slugs.test.ts` (`media` reservado); 197/197 en total |
| AC-2 | ✅ | `pnpm build && pnpm start --port 3001`. `curl -I /media/<shop>/<hex>.webp` → 200, `content-type: image/webp`, `cache-control: public, max-age=31536000, immutable`, `x-content-type-options: nosniff`. 404 para `/media/a/b/c.jpg`, `/media/<shop>/x.svg`, un archivo inexistente (con nosniff), `/media/<shop>/..%2F..%2F.env` y `/media`. Con `--path-as-is`, `/media/../.env` y `/media/%2e%2e/x.jpg` dan 404 y nunca llegan al handler: Next los normaliza a `/.env` y `/x.jpg`. **Ojo:** el *primer* request a cualquier path desconocido de un solo segmento con punto (también `/zzz.qq`, sin relación con este job) devuelve la página genérica de not-found con status 200, y los siguientes dan 404. Es comportamiento previo de Next y nunca sirve archivos. |
| AC-3 | ✅ | Smoke con HTTP real a las Server Actions (`Next-Action` + `encodeReply`): se rechazan SVG, archivo vacío y >3MB con mensajes en español. BARBER → FORBIDDEN. Un JWT válido de un usuario inexistente → FORBIDDEN. Sin cookie el proxy redirige antes. En todos esos casos no se escribió ningún archivo. OWNER sube y el archivo queda en `<UPLOADS>/<shopId>/<32hex>.webp`. Llegan 24 fotos con sortOrder 0..23 y la 25 devuelve "Llegaste al máximo de 24 fotos." sin dejar archivo. El conteo corre en una transacción con `SELECT … FOR UPDATE` sobre la barbería. Si el insert falla se borra el archivo. Reemplazar o quitar portada y logo borra el anterior. Un `logoUrl` externo solo se reemplaza, y un `/media/` de otra barbería no se borra. |
| AC-4 | ✅ | Smoke: alt guardado; alt >150 → `fieldErrors.alt`. ↓/↑ intercambian el sortOrder con el vecino. Otro OWNER no puede editar alt, mover ni borrar ("No encontramos esa foto."), y fila y archivo quedan intactos. BARBER no borra. Borrar elimina fila y archivo, y si el archivo ya no existe igual borra la fila. Las fotos nuevas entran con `max+1`. |
| AC-5 | ✅ | Smoke: `"@barber.ok"` se guarda como `barber.ok` y el link de maps válido se guarda. `https://evil.com/?google.com` → `fieldErrors.googleMapsUrl`. BARBER → FORBIDDEN. Vacío → `null` (cubierto en test). El WhatsApp sigue en el perfil. |
| AC-6 | ✅ | `getPublicLanding` vía tsx (`--conditions=react-server`). La barbería demo devuelve cover/logo `/media/...`, gallery `{id,url,alt}` ordenada, instagram `{handle,url}`, `whatsappUrl` `https://wa.me/549…` y `mapsUrl` = el link cargado. Una barbería sin link usa `mapsSearchUrl(address)`. Un slug inexistente → `null`. No expone `barbershopId` ni `storageKey`. Todas las actions llaman `updateTag(barbershopBrandingTag(slug))` + `revalidatePath`, y `/barberia-demo` mostró enseguida el logo nuevo con `<img src="/media/…">` sin cambios visuales. |
| AC-7 | ✅ (sin prueba en navegador) | Con sesión OWNER, `/dashboard/settings` muestra "Página pública", "Fotos de tus trabajos", `23/24`, "Guardar redes" y la ayuda "Si lo dejás vacío usamos tu dirección", y ya no aparece `profile-logoUrl`. Con BARBER redirige a `/dashboard`. El downscale con `<canvas>` y el flujo de clicks **no se probaron en un navegador real** (no hay browser en este entorno), solo pasaron typecheck, lint y build. |
| AC-8 | ✅ | `.gitignore` tiene `/storage/`, `.env.example` documenta `UPLOADS_DIR`, `bodySizeLimit: "4mb"`. Los 4 checks pasan. |

## Checks
lint ✅ · typecheck ✅ · test ✅ (13 files, 197 tests) · build ✅ (sin warnings)

## Notas
- Las actions de archivos reciben un único `FormData` (las llama el cliente dentro de `startTransition`). `updateSocialLinks` usa `(prev, formData)` para `useActionState`.
- `ownerSession()` está duplicada (privada) en `actions/landing.ts`: exportarla desde un archivo `"use server"` la convertiría en un endpoint.
- `isGoogleMapsUrl` acepta `maps.google.com` con cualquier path (es un host de Maps). `google.com`, `www.google.com` y `goo.gl` exigen el path `/maps…`.
- En el `.env` del worktree quedó `UPLOADS_DIR=./storage/uploads` (dentro del worktree). El smoke dejó fotos de prueba en `barber_job_014` y en `.worktrees/014-landing-content/storage/` (ignorado por git).

## Respuesta a la ronda 1
**Commit:** 77d227f · lint ✅ · typecheck ✅ · test ✅ (197) · build ✅ (sin warnings) · smoke de actions contra `pnpm start` en 3001 ✅

- ui [blocking] → desborde de las acciones de la galería: corregido sin depender del viewport.
  - La grilla usa una container query sobre la sección (`@container` + `grid-cols-1 @lg:grid-cols-2`): pasa a 2 columnas recién cuando el contenedor mide ≥512px, así cada tarjeta tiene ≥248px de ancho total (≈232px útiles). Saqué las 3 columnas. El `main` mide como mucho 3xl, así que a 768px el contenido queda en ≈704px, son 2 columnas de ≈344px cada una.
  - La fila de acciones tiene 3 botones de ícono de 44px (↑, ↓, borrar) con `aria-label` y `flex-wrap`, y ocupa ≈148px.
  - La confirmación del borrado va en una fila propia debajo (`role="group"`, fondo `bg-destructive/10`, texto "¿Borrar esta foto? No se puede deshacer."). Ahí "Cancelar" y "Sí, borrar" son `flex-1 basis-24 min-w-0` dentro de un `flex-wrap`, con altura de 44px. El botón de tacho lleva `aria-expanded`/`aria-controls`.
  - El `li` tiene `min-w-0`, y en la fila de descripción el Input es `min-w-0 flex-1` y "Guardar" es `shrink-0`.
  - Cuentas por ancho:
    - 360px: el contenedor mide ≈296px, 1 columna con ≈280px útiles. La confirmación entra en una línea.
    - 420px: el contenedor mide ≈356px, sigue en 1 columna (antes saltaba a 2 columnas de ≈140px y desbordaba).
    - 768px: 2 columnas de ≈344px. Los ≈148px de acciones y los ≈200px de los dos botones de confirmación entran holgados.
    - Peor caso de 2 columnas (contenedor de 512px): ≈232px útiles, también entra. Si no entrara, envuelve en vez de desbordar.
- ui [nit] `<img>` nativo → es intencional: URLs `/media` propias y logos externos viejos sin `remotePatterns`, y el spec deja `next/image` fuera de alcance. Sin cambios.
- ui [nit] `ring` vs `border` en las tarjetas → lo dejo con `ring`, que es consistente con `Card` y las previews.
- ux [nit] createImageBitmap en Safari viejo → `decode()` prueba primero con `{ imageOrientation: "from-image" }`. Si falla, reintenta `createImageBitmap(file)` sin opciones, y si tampoco anda (o la API no existe), cae a `<img>` + `img.decode()` con un object URL.
- ux [nit] mostrar el valor normalizado → `updateSocialLinks` devuelve `values` (nuevo campo opcional en `ActionResult`) y el mensaje "Redes guardadas. Instagram: @usuario.". El form reemplaza los inputs con esos valores, ajustando el estado durante el render y sin `useEffect`. Verificado en el smoke: `values.instagram === "@barber.ok"`.
- ux [nit] errores de la galería con `file.name` → ahora dicen "Foto N: …" cuando se suben varias, y juntan todos los errores en vez de solo el último.
- ux [nit] WhatsApp → la nota tiene un link ancla a `#profile-whatsapp`.
- security [nit] lectura de bytes antes de la sesión → no coincido en cambiarlo: el orden validar → sesión lo pide el spec, y Next ya parsea el body hasta `bodySizeLimit` antes de la action, así que no agrega superficie.
- security / code [nits] restantes (rate limit, sweep de huérfanos, ETag) → sin acción, ya están justificados en las reviews.
- Igual que antes: el flujo de clicks y el `<canvas>` no se probaron en un navegador real. El layout se razonó a partir de las clases.
