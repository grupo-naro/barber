VERDICT: PASS

## Hallazgos
- [nit] `src/app/media/[...path]/route.ts`: no emite `ETag`/`Last-Modified`. Con `immutable` y nombres aleatorios no hace falta, y el spec (AC-2) no lo pide. Sin acción.
- [nit] `src/server/media-storage.ts` `readImage`: lee el archivo entero en memoria (`readFile`). Aceptable con tope de 3MB por archivo.
- [nit] `src/server/actions/landing.ts`: `deleteGalleryImage` borra la fila y después el archivo (best effort). Si falla el disco queda un archivo huérfano, pero la fila nunca queda apuntando a un archivo inexistente. Es el orden correcto.
- [nit] El route handler agrega `Content-Security-Policy: default-src 'none'; sandbox`. Es un hardening extra, correcto.

## Notas de la revisión (foco pedido)
- Storage multiplataforma: usa `node:path` con `resolve` y `relative`. Las keys y URLs llevan siempre `/`, y a disco se baja con `resolve(root, owner, file)`. Se verifica que no escape de la raíz. Las keys se validan con regex estricta antes de tocar el disco.
- Escritura: `mkdir` recursivo + `writeFile` con `flag: "wx"` y nombre aleatorio de 16 bytes. Si falla la transacción de DB (galería, portada o logo), se borra el archivo recién escrito. Para galería, el conteo y el insert corren dentro de una transacción con `FOR UPDATE` sobre la fila de la barbería.
- Borrado y reemplazo: borra fila y archivo de forma consistente. Todo filtra por `barbershopId` de la sesión. Un `logoUrl` externo no toca el disco (`mediaKeyFromUrl`).
- Route `/media`: 404 limpio sin tocar disco ante formato inválido. Headers: Content-Type por extensión, Content-Length, `Cache-Control: public, max-age=31536000, immutable`, `nosniff`.
- `next.config.ts`: `experimental.serverActions.bodySizeLimit: "4mb"` es la clave correcta para Next 16.
- Invalidación: toda mutación (alt, mover, borrar, portada, logo, redes, subida) llama `invalidate()`, que hace `updateTag(barbershopBrandingTag(slug))` y `revalidatePath`.
- API para el job 015: `getCachedLanding(slug)` usa `"use cache"`, `cacheLife("minutes")` y el tag del branding. Devuelve `PublicLanding | null`, sin `storageKey` ni `barbershopId` crudos.
- Reordenamiento: transacción con lock. Intercambia `sortOrder` con el vecino y, si hay empate, renumera de 0..n-1. No quedan huecos ni duplicados que importen. Los nuevos van a `max + 1`. En el flujo normal no hay N+1; solo el camino de renumerado por empate hace updates en un loop, dentro de la transacción y acotado a 24 filas.
- TypeScript: sin `any`, `@ts-ignore` ni `!`. Hay un único `as NodeJS.ErrnoException` en un catch, aceptable.
- Migración vs schema: `prisma migrate diff` devuelve "No difference detected" (exit 0).

## Revisado
lint ✅ · typecheck ✅ · test ✅ · build ✅ · scope ✅ (23 archivos, todos dentro de Target Files) · migración sin drift ✅ · AC-1..AC-8 ✅ (revisión de código; AC-2 por curl no ejecutado, el route compila y 404/200 se deducen del código)
