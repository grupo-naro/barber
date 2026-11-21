VERDICT: PASS

## Hallazgos
- [nit] `src/app/[slug]/hero.tsx` (overlay con portada): el degradé baja a 0.55 de opacidad a ~70% de altura. Sobre una foto muy clara, la descripcion y la direccion (`text-foreground/75`) quedan algo justas en esa franja. Contraste AA probable pero sin margen → subir el tramo medio a ~0.65 o agregar `text-shadow` leve. No bloquea: el titulo y los CTA caen en la zona de 0.88+.
- [nit] `hero.tsx`: la portada usa `object-cover` sin `object-position`, asi que centra. Para retratos/fotos con el sujeto arriba puede cortar la cabeza en mobile → aceptable por ahora (se podria exponer un foco de portada mas adelante).
- [nit] Hero sin portada: con `min-h-[64svh]` el espacio vacio entre el logo y el titulo es grande (en la captura desktop de 3000px se infla, en 768px es normal). Verificado visualmente solo el fallback; el camino con portada se razono sobre el codigo.
- [nit] `gallery.tsx`: el `ring-offset` de foco sobre la miniatura y los controles del lightbox estan bien; falta un indicador de hover/affordance en las miniaturas en touch (solo escala en hover con `motion-safe`). Opcional.

## Revisado
Direccion visual distintiva (Bodoni Moda display + Geist cuerpo, paleta tabaco/cuero/hueso con un unico acento laton, lineas punteadas tipo pizarra de precios), contraste AA holgado en el fallback (hueso/ceniza/laton sobre tabaco; boton laton con texto tabaco), tema oscuro acotado a `/[slug]` via `layout.tsx` + `landing.css` sin tocar `globals.css` ni el dashboard, tokens de shadcn heredados por Button/Badge, lightbox con `<dialog>` nativo y foco devuelto, `motion-safe` en animaciones y smooth scroll, captura mobile 390px sin desborde.
