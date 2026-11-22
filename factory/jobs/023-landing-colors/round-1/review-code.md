VERDICT: PASS

## Hallazgos
- [nit] `src/lib/brand-colors.ts`: si el dueño guarda explícitamente los valores originales (en vez de "Restablecer"), la raíz recibe un `style` con exactamente los valores de hoy. Es equivalente visualmente y la spec lo permite; no bloquea.
- [nit] `searchLightness`: el bucle lineal final de rescate casi nunca corre (la búsqueda binaria ya converge); es defensivo y aceptable.

## Revisado
- Matemática: sRGB→linear con umbral 0.04045 y exponente 2.4, luminancia con 0.2126/0.7152/0.0722 y ratio (L1+.05)/(L2+.05), todo correcto. El ajuste es HSL con tono y saturación fijos, y la luminancia es monótona en `l`. Es determinista y termina (40 iteraciones más un paso acotado). El barrido de colores y los casos negro, blanco, amarillo, verde lima, cian y casi negro cumplen todas las reglas de AC-2.
- Con `null`/`null`, `brandStyle` devuelve `undefined`, así que no hay atributo `style` y el HTML queda idéntico. Los originales explícitos dan los valores exactos (testeado).
- Migración `20261122013553_brand_colors`: solo agrega 2 columnas TEXT nulables y va después de `20261121210000_session_revocation`. El diff de `schema.prisma` con `-w` son solo 4 líneas añadidas, así que el realineo es solo espacios en blanco. `prisma migrate diff` da "No difference detected".
- Inyección: el layout aplica solo `brandStyle(...)`, cuya salida pasa por `brandPalette` (regex y hex re-generado). No se arma ningún `<style>` con strings del usuario. Schema Zod con test de rechazo de `red`, `#fff`, `#000000;}`, `url()`, espacios y salto de línea.
- Acción: `safeParse` → `ownerSession()` → `update` con `session.barbershopId` → `invalidate`. Reset guarda `null`.
- Caché: el layout usa `getCachedLanding` (mismo `cacheTag` de branding) y solo barberías ACTIVE. Un slug inválido no consulta la DB (`validateSlug`) y usa los colores por defecto. `pnpm build` sin avisos.
- Límites cliente/servidor: `brand-colors.ts` es puro y lo comparten la vista previa del cliente y el layout del servidor. TS estricto, sin `any` ni `!`; solo un `as CSSProperties` en el form, justificado.
- Scope: los 12 archivos tocados están dentro de `## Target Files (Scope)`.
- Nota de proceso: `round-1/build.md` no existía al revisar. Verifiqué directamente contra el código.

lint ✅ · typecheck ✅ · test ✅ (331) · build ✅ · prisma diff ✅ · scope ✅ · AC-1..AC-7 ✅ (la verificación visual en dev de AC-5 no se hizo desde este review)
