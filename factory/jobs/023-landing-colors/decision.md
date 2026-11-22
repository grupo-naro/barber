ESCALATE

**Motivo:** Cambio de schema y migración (Barbershop.brandPrimary/brandSecondary). Las 4 reviews dan PASS y los checks pasan, pero un humano tiene que aprobarlo.

## Notas
- **Por qué se escala:** toca `prisma/schema.prisma` y agrega `prisma/migrations/20261122013553_brand_colors/` (dos columnas `TEXT` nulables con `ADD COLUMN`, sin borrar datos y sin backfill). Es aditivo y queda después de `20261121210000_session_revocation`. El diff de schema con `-w` son 4 líneas, y el resto es realineo de `prisma format`. El review de código confirmó "No difference detected" con `prisma migrate diff`. El spec ya avisaba que este job iba a escalar por esto.
- **Todo lo demás está en regla:** las 4 reviews de la ronda 1 dan `VERDICT: PASS`. Los AC-1 a AC-7 tienen evidencia en `build.md`, y lint, typecheck, test (331) y build pasan sin avisos. Los 12 archivos tocados están en el scope. No toca auth (`auth.ts` solo se importa), ni `proxy.ts`, ni dependencias, ni env o secretos.
- **Seguridad:** la acción sigue el orden `safeParse` → `ownerSession()` → `update` con `session.barbershopId` → `invalidate`. En la landing solo llegan hex que regenera `brandPalette`, y van como custom properties en el `style` de la raíz. No se arma ningún `<style>` ni se usa `dangerouslySetInnerHTML`.
- **Qué mirar antes de mergear:** que la migración se aplique bien en la base de producción o compartida. Que `layout.tsx`, ahora async con `await params` y `getCachedLanding`, no rompa el 404 real (build.md dice que `/no-existe` y `/barberia-demo/nope` dan 404) ni el prerender (`/[slug]` sigue `◐`).
- **Nits abiertos (no bloquean):**
  - code: si el dueño guarda los colores originales a mano, en vez de usar "Restablecer", la raíz recibe un `style` con los mismos valores de hoy. Se ve igual y el spec lo permite.
  - code: el bucle lineal de rescate de `searchLightness` es defensivo y casi nunca corre.
  - security: `HEX_COLOR_RE` está anclada y sin flags, lo cual es correcto. No hace falta hacer nada.
  - ui: los presets "dorado" (`#9a6700`) y "amarillo" (`#8a6100`) salen ocre o marrón. Conviene renombrar "Grafito y amarillo" a "Grafito y ocre".
  - ui: `hours-section.tsx` usa `text-[#4a4a4a]`, un gris neutro que no es del acento. No hace falta hacer nada.
  - ux: si el hex se pega sin "#", la vista previa vuelve al original sin avisar. Habría que normalizarlo en `onChange` o mostrar el error en vivo.
  - ux: al aviso de ajuste le falta un chip de color al lado del hex ajustado.
  - ux: "Restablecer colores originales" no pide confirmación. Ya muestra "Volviste a los colores originales.".
  - ux: la ayuda "Formato #rrggbb." aparece repetida en cada campo.
