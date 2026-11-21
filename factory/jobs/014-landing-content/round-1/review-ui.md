VERDICT: CHANGES

## Hallazgos
- [blocking] `src/app/(dashboard)/dashboard/settings/landing-form.tsx:225,342-403`: la grilla pasa a 2 columnas desde 420px de viewport, así que cada tarjeta mide ~140-160px. La fila de acciones (2 botones flecha de 44px + "Cancelar" + "Sí, borrar", sin `flex-wrap`) desborda la tarjeta cuando se pide confirmar el borrado. La fila "Descripción" (Input + "Guardar") también queda muy apretada → subir el breakpoint de 2 columnas a `sm:` (640px) o usar `min-[560px]`, y agregar `flex-wrap` a la fila de acciones (o mostrar la confirmación en una línea aparte).
- [nit] `landing-form.tsx:134,308`: `<img>` nativo en lugar de `next/image`. Está justificado con un comentario (URLs de `/media` y logos externos viejos), pero conviene confirmar que sea intencional.
- [nit] `landing-form.tsx:305`: el `li` usa `ring-1 ring-foreground/10` con `rounded-xl` y no `border`. Es consistente con las previsualizaciones, pero es distinto de los otros formularios de settings.

## Revisado
Sección "Página pública": usa componentes y tokens de shadcn (`bg-muted`, `text-muted-foreground`, `ring-foreground/10`, `text-destructive`) y no tiene colores crudos, así que funciona en modo oscuro. Miniaturas `aspect-square object-cover`, vista previa de portada 16:9 y logo `size-20`, estados vacíos con placeholder, botones de 44px, `tabular-nums` en el contador y mensajes de estado accesibles están bien; el único problema es el desborde en el ancho intermedio.
