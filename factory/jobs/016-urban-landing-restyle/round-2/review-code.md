VERDICT: PASS

## Hallazgos
- Blocker 1 (fonts latin-ext): resuelto. Anton y Kaushan Script cargan con `subsets: ["latin", "latin-ext"]`, `display: "swap"`, un solo peso.
- Blocker 2 (`.landing-sticker-sm`): resuelto. La regla se borró y no queda ninguna referencia en `src/` (grep). `--royal-claro` también se borró y no tiene referencias.
- [nit] En `landing.css` queda una línea en blanco doble donde estaba la regla borrada. Cosmético.
- [nit] Siguen los colores hardcodeados (`#000`/`#fff`) mezclados con tokens; el builder lo dejó como intencional. No bloquea.

## Delta de la ronda (HEAD~1..HEAD, 4 archivos, todos en `src/app/[slug]/`)
- `hero.tsx`: banda del poste en `lg+` sobre la portada y texto limitado al 60%. Solo presentación. CTA secundario oscuro con borde `--sticker-edge`.
- `gallery.tsx`: 3 columnas en `md+` y `sizes` ajustado. Sin cambios de lógica.
- `landing.css`: `.landing-btn` toma el borde de `--sticker-edge`. Su uso se verificó en `hero.tsx` y `gallery.tsx`. Sin selectores nuevos fuera de `.landing-theme`.
- No hay problemas nuevos: sin `any`, sin `!`, sin cambios de data, queries ni actions.

## Revisado
lint ✅ · typecheck ✅ · test ✅ · build ✅ · scope ✅ (solo `src/app/[slug]/**`) · AC-1..AC-6 ✅
