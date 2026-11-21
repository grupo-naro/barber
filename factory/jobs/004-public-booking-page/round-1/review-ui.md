VERDICT: PASS

## Hallazgos
- [nit] `src/app/[slug]/shop-header.tsx:31`: el `h1` y la dirección no tienen `break-words`; un nombre de una sola palabra muy larga podría desbordar en 360px → agregar `break-words` al `h1` y al `span` de la dirección.
- [nit] `src/app/[slug]/shop-header.tsx`: no hay un CTA "Reservar turno" en el header (existe `id="reservar"` en `booking-section.tsx` pero nada enlaza a él). El flujo queda justo debajo del header, así que el CTA es visible, pero con descripción larga se aleja → un `<a href="#reservar">` con `Button` (shadcn) en el header.
- [nit] `src/app/[slug]/shop-header.tsx:41,50`: los botones WhatsApp/teléfono son `<a>` con clases a mano en vez de `Button variant="outline"` de shadcn (sin foco visible explícito) → usar `buttonVariants`.
- [nit] `src/app/[slug]/booking-form.tsx:52`: la hora de la confirmación (`{time} hs`) no usa `tabular-nums` y el precio no se repite en el resumen → agregar `tabular-nums` y mostrar el precio.
- [nit] `src/app/[slug]/shop-header.tsx:15`: el logo usa `<img>` nativo (justificado con comentario por logos de origen arbitrario) en vez de `next/image`; aceptable, pero sin `width`/`height` explícitos (usa `size-16`, sin CLS).

## Revisado
Landing `/[slug]`: branding (logo o iniciales con `bg-primary`, nombre, dirección), precios con `tabular-nums` alineados a la derecha, horarios en grilla `tabular-nums`, estados seleccionados consistentes (`primary`), tokens de tema y componentes shadcn (Card, Button, Input, Label, Badge), responsive 360px (`max-w-xl`, `min-w-0`, scroll horizontal de días) y modo oscuro por tokens; sin colores crudos.
