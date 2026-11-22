VERDICT: PASS

## Hallazgos
- [nit] `src/lib/brand-colors.ts:43`: los presets dorado/amarillo (#9a6700, #8a6100) salen ocres/marrones sobre negro. Es el costo de cumplir texto blanco >= 4.5:1; con la regla de la spec no hay un amarillo más vivo posible como superficie. Aceptable. Opcional: renombrar "Grafito y amarillo" a "Grafito y ocre" para no prometer un amarillo que no se ve.
- [nit] `src/app/[slug]/hours-section.tsx:59`: `text-[#4a4a4a]` es un gris neutro, no del acento; no es un resto del azul/rojo. Sin acción.

## Revisado
Sin hex viejos (#1f2e9a/#d7191f/#ff6b70) en `src/app/[slug]` fuera de los defaults de `landing.css`; todo usa `--royal/--rojo/--rojo-claro/--royal-muted`. Con colores nulos no hay `style`, así que el diseño por defecto queda idéntico. La captura verde muestra franja, sombras, tags de precio, fila "hoy" y links siguiendo el tema; `--rojo-claro` derivado (link "Reservá online") se lee bien sobre negro; la vista previa del panel es fiel a la landing real.
