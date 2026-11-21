VERDICT: PASS

## Hallazgos
- [nit] `src/server/actions/landing.ts:662` (`readImageField`): el `arrayBuffer()` y el sniff de magic bytes corren antes de `ownerSession()`, así que cualquiera, sin sesión, puede hacer que el servidor procese hasta 4MB por request. Lo pide el orden del spec (validar → sesión) y Next igual parsea el body hasta `bodySizeLimit` antes de la action, así que no agrega superficie real. Opcional: chequear `file.size` y, recién después de la sesión, leer los bytes.
- [nit] `src/server/actions/landing.ts:685/806/850`: no hay rate limit en las subidas. Es OWNER-only y el disco por barbería queda acotado (24 de galería + portada + logo; los reemplazos borran el archivo anterior, y lo que sobra por concurrencia o por galería llena se limpia). El único riesgo es churn de IO. Aceptable por ahora.
- [nit] `src/server/actions/landing.ts:696`: si el proceso se cae entre `saveImage` y el commit de la transacción queda un archivo huérfano bajo `<raíz>/<shopId>/` (no se sirve por ningún lado salvo con su nombre aleatorio de 128 bits). Si se rompe la DB, se limpia en el `catch`. Un sweep de huérfanos queda para más adelante.
- [nit] `next.config.ts`: `bodySizeLimit: "4mb"` es global y también aplica a la reserva pública. Ya está aceptado en Riesgos del spec, y la reserva tiene rate limit.

## Verificado (sin problemas)
- **Traversal en lectura:** `parseMediaPath` exige exactamente 2 segmentos, `^[a-z0-9]{20,40}$` y `^[a-f0-9]{32}\.(jpg|png|webp)$`, así que `..`, `%2e%2e`, `\`, `/` absolutos, null bytes, mayúsculas y `.svg`/`.html` dan `null` → 404 sin tocar el disco. `keyToPath` además verifica con `path.relative` que el resultado quede dentro de la raíz.
- **Traversal en escritura:** la key se arma con `session.barbershopId` (validado con `isMediaOwnerId`) + `randomBytes(16)` hex + una extensión que sale de los magic bytes. Escribe con `flag: "wx"`. El nombre y el MIME del cliente no se usan nunca.
- **Contenido:** whitelist por magic bytes (JPEG/PNG/WebP). SVG, HTML y GIF se rechazan. Un polyglot que empiece con una firma válida se sirve con `Content-Type` fijo por extensión + `X-Content-Type-Options: nosniff` + `Content-Security-Policy: default-src 'none'; sandbox`, y tampoco ejecuta si se abre directo.
- **Tamaño:** el servidor rechaza más de 3MB (`file.size`), aparte del downscale del cliente, y Next corta en 4MB.
- **Tenant:** todas las mutaciones filtran con `{ id, barbershopId: session.barbershopId }` (`updateMany`/`deleteMany`/`findFirst`). `moveGalleryImage` busca el id solo dentro de la galería de la sesión. Los borrados de disco pasan por `isKeyOfShop`/`mediaKeyFromUrl`, así que una key o un `logoUrl` `/media/` de otra barbería nunca se borra. `storageKey @unique` y siempre generada por el servidor. No hay IDOR.
- **Rol:** `ownerSession()` usa el rol de la DB (`getSession` revalida usuario activo y barbershopId). BARBER o sin sesión → FORBIDDEN antes de cualquier escritura. `ownerSession` no se exporta desde el archivo `"use server"`. La página usa `requireRole("OWNER")` y `getLandingSettings(session.barbershopId)`.
- **Tope de la galería:** el conteo es server-side dentro de la transacción con `SELECT … FOR UPDATE` sobre la barbería, y si se pasa del tope borra el archivo escrito.
- **Redes:** `isGoogleMapsUrl` acepta solo `https:`, sin user/pass/port y con una lista cerrada de hosts (rechaza `javascript:`, `http:`, `evil.com/?google.com`, `google.com.evil.com`). Instagram se normaliza a `^[a-zA-Z0-9._]{1,30}$` y la URL se arma en el servidor. Las keys de logo y portada salen siempre de `saveImage`, nunca de input del usuario.
- **Storage fuera de `public/`:** `UPLOADS_DIR` (default `./storage/uploads`, ignorado por git) se sirve solo a través del route handler. `media` es slug reservado.
- **Lectura pública:** `getPublicLanding` usa `select` explícito y no expone `barbershopId`, `storageKey`, teléfonos ni montos. No hay `dangerouslySetInnerHTML` en el form.

## Revisado
Diff completo de `main...factory/014-landing-content` (media.ts, landing.ts, media-storage.ts, actions/landing.ts, queries/landing.ts, route `/media/[...path]`, settings page/form, next.config, schema/migración) + `src/lib/auth.ts#getSession`.
