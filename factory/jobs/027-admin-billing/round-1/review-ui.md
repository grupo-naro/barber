VERDICT: PASS

## Hallazgos
- [nit] `src/app/admin/(panel)/billing-badge.tsx:16`: GRACE y AWAITING comparten la variante `secondary` con un ring, así que se distinguen solo por el texto. Si el listado crece, conviene un tono propio, por ejemplo con un token de warning.
- [nit] `src/app/admin/(panel)/barbershops/[id]/billing/subscription-section.tsx:90`: los tres `Disclosure` en `grid lg:grid-cols-2` dejan un hueco vacío en la segunda fila. Con `items-start` se vería más prolijo. Los `<details>` son nativos y no hay componente shadcn equivalente en `components/ui`.
- [nit] `.../billing/subscription-section.tsx:46`: hay un `<h2>` dentro de `CardTitle`. Es válido, pero si `CardTitle` ya renderiza un heading puede quedar anidado. Revisar.

## Revisado
Se revisó la superficie del admin: badge de cobro, sección Suscripción, link copiable, formularios y ajustes. Usan los componentes `Badge`, `Card`, `Button`, `Input` y `Label` y tokens de tema, sin colores crudos. Los montos y fechas llevan `tabular-nums`, el layout es responsive (columnas apilan en móvil, `break-words` y `break-all` en mails y links) y no hay landing pública ni imágenes en este cambio.
