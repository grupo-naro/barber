APPROVE

**Motivo:** Las 4 reviews dan PASS, AC-1..AC-8 tienen evidencia y checks en verde, el diff está dentro del scope y no toca auth, schema, dependencias, env ni datos.

## Notas
- Diff (18 archivos, 1 commit a297624): `src/app/[slug]/**`, `src/server/queries/landing.ts` (solo agrega `getPublicOpeningHours`, con `select` acotado y de solo lectura) y `next.config.ts` (solo `images.localPatterns: [{ pathname: "/media/**", search: "" }]`). Todo eso está en el scope.
- No se tocaron hot files: `package.json`, el lockfile, `prisma/`, `src/proxy.ts`, `src/lib/auth.ts`, `src/app/layout.tsx`, `globals.css` y `src/components/ui/**` quedan iguales. `shop-header.tsx` se borra, pero es código reemplazado por `hero.tsx`, no un borrado de datos.
- Optimizador de imágenes: el orquestador lo verificó en vivo (`pnpm start`). `/media/<file>` da 200 y `/favicon.ico`, una URL externa y `/media/../../.env` dan 400, así que el optimizador no queda como proxy abierto.
- La reserva (job 013) queda intacta: no se tocaron `actions/booking.ts`, `queries/booking.ts` ni `lib/slots.ts`, y la reserva de punta a punta se verificó en `pnpm start`.
- Para un job futuro (no bloquea): `openGraph.images` es relativo y no hay `metadataBase`, así que en producción conviene definirlo. También quedan nits de UI: el contraste del overlay a media altura del hero y el `object-position` de la portada.
