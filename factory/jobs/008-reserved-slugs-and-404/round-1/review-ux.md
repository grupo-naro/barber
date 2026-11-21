VERDICT: PASS

## Hallazgos
- [nit] `src/app/[slug]/not-found.tsx:11`: el único paso siguiente es "Ir al inicio", que lleva a la página de producto ("MVP en construcción"), no a reservar. Para el cliente que tipeó mal el link conviene sumar una línea como "Si no te funciona, pedile el link de nuevo a tu barbería." → agregar ese texto (sin romper el CTA actual).
- [nit] `src/lib/slugs.ts:44`: el mensaje dice "El slug tiene que tener…"; "slug" es jerga para quien se registre. → "La dirección tiene que tener entre 3 y 40 caracteres." (y evitar "slug" en los mensajes de formato, que ya hablan de "dirección" en el de reservada). El test regex `/slug|Usá|reservada/` sigue pasando con "Usá"/"reservada" en los otros casos; ajustar el matcher si se cambia el primero.
- [nit] `src/app/not-found.tsx:15`: "la barbería ya no está disponible" puede sonar a que cerró; ok, pero "La dirección no existe o cambió" es más neutro.

## Revisado
Páginas 404 (global y de barbería): español rioplatense (voseo "Revisá"), h1 claro, `<main>`, CTA con buttonVariants (foco/táctil estándar), legible a 360px (max-w-xl, px-4); mensajes de validación de slug claros y accionables (reservada → "Elegí otra"; formato explica qué usar). Sin flujo de toques (solo 404 → 1 toque a inicio).
