ESCALATE

**Motivo:** Trae cambio de schema + migración (`GalleryImage` y 3 columnas en `Barbershop`) y una variable de entorno nueva (`UPLOADS_DIR`). Las reglas obligan a revisión humana aunque las 4 reviews dieron PASS.

## Notas
- Ronda 2: las 4 reviews (code, security, ui, ux) dan `VERDICT: PASS`. AC-1..AC-8 tienen evidencia en build.md, y lint, typecheck, test (197) y build pasan. El diff son 23 archivos, todos dentro de Target Files. No toca `src/lib/auth.ts`, `src/proxy.ts`, `package.json` ni el lockfile (no hay dependencias nuevas).
- Migración `20261121030811_landing_content`: no destructiva (ADD COLUMN nullable + CREATE TABLE con FK cascade e índices). `prisma migrate diff` no muestra drift. Hay que aplicarla en prod con `prisma migrate deploy`.
- `UPLOADS_DIR`: en producción tiene que apuntar a un volumen persistente montado fuera de la imagen, o las fotos se pierden al recrear el contenedor. Con varias réplicas el disco local no se comparte.
- `next.config.ts`: `bodySizeLimit: "4mb"` es global y también aplica a las actions públicas de reserva. El riesgo ya figura en el spec.
- `media` pasa a ser slug reservado: antes de mergear, confirmar en prod que ninguna barbería use ese slug.
- AC-7 (downscale con `<canvas>` y el flujo de clicks del panel) no se probó en un navegador real. Conviene una prueba manual en el celular antes de dar el job por cerrado.
- Archivos para mirar con detalle: `src/server/actions/landing.ts`, `src/server/media-storage.ts` y `src/app/media/[...path]/route.ts`.
