VERDICT: PASS

## Hallazgos
- [nit] `src/app/admin/(panel)/plan-badge.tsx`: el badge "Vence pronto" depende de `secondary` + ring; se distingue del gris, pero el contraste frente a "Vencido" (destructive) es suficiente solo por el texto. Aceptable.

El blocking de la ronda 1 queda resuelto. El plan se muestra con `Badge` en la tabla y en el detalle. Los vencidos usan `destructive` y los que vencen pronto usan un badge resaltado, con los mismos umbrales que `planBanner`. Los nits de `tabular-nums` y de `flex-wrap` en el header también están aplicados.

## Revisado
Delta HEAD~1..HEAD (plan-badge, tabla, detalle, layout, create-form) contra la respuesta a la ronda 1 en build.md.
