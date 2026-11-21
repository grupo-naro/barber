VERDICT: PASS

## Hallazgos
- [nit] Hero desktop: con portada el texto queda en el 60% izquierdo y el lado derecho es casi solo el bokeh de la portada, con el badge de Instagram suelto arriba. Funciona, pero se siente vacío; un elemento a la derecha (el logo grande o la banda del poste, como en el fallback sin portada) lo compondría mejor.
- [nit] Galería desktop: 6 fotos en 4 columnas dejan la segunda fila a medias (2 de 4). Con 6 ítems 3 columnas cerraría sin hueco.
- [nit] Reserva desktop: la columna izquierda tiene solo el título y el texto, y la derecha el paso 1 largo. Es aceptable, pero el título podría quedar `sticky` mientras se scrollea.
- [nit] Texto pequeño en cards de servicios (descripción y duración, ~11-12px en mobile). El contraste cumple (8.86:1), pero conviene subirlo a 13px.
- [nit] `--royal-claro` está definido pero no se usa; se puede borrar para no dejar tokens huérfanos.
- [nit] `[slug]/not-found.tsx` no se puede ver con un slug inexistente, porque `src/proxy.ts` hace rewrite al `not-found` global. Es lo mismo que en 015 y queda fuera de scope. Anotar como deuda: el 404 real sigue sin el tema urbano.

## Revisado
- El lenguaje del logo está bien traducido: negro, blanco, royal y rojo, el poste diagonal como divisor, sticker con borde grueso y sombra dura, script con contorno y sombra roja (solo decorativo, `aria-hidden`).
- Los stickers son consistentes: borde de 3px y sombra desplazada sin blur, con la sombra negra sobre papel y royal y blanca sobre negro.
- El contraste de la tabla de build.md cumple AA con margen: blanco/rojo 5.19, blanco/royal 10.96, rojo claro/negro 7.59, y el royal y el rojo puros nunca van como texto sobre negro.
- Anton y Kaushan Script cargan con `next/font` (`display: swap`, `adjustFontFallback` por defecto), subset `latin`. Los glifos á é í ó ú ñ ¡ ¿ se verificaron sin fallback.
- Hay foco visible y `reduced-motion` respetado.
- La reserva usa los mismos stickers, el mismo display y las mismas superficies papel/royal que el resto de la landing.
- Capturas de mobile (390) y desktop (1366) revisadas.
