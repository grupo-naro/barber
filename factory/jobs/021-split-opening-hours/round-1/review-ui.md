VERDICT: PASS

## Hallazgos
- [nit] `src/app/[slug]/hours-section.tsx:58`: con dos franjas el `<dd>` ("10:00 – 14:00 · 17:00 – 21:00", ~29 caracteres) a 360px compite con "Miércoles" + badge "hoy" en la fila de hoy (que además es más angosta por el px-6/-mx-6). Puede cortar dentro de una franja ("10:00 –" / "14:00 ·"). → renderizar cada franja en un `<span className="whitespace-nowrap">` para que solo corte en el " · ", o separar las franjas en líneas (`flex-col items-end`).
- [nit] `src/app/(dashboard)/dashboard/settings/hours-form.tsx:84`: el switch Abierto/Cerrado está hecho a mano (no hay `Switch` en `src/components/ui`). Usa tokens (`bg-input`, `bg-primary`, `bg-background`, `ring-ring`), así que anda en modo oscuro; si se agrega un Switch de shadcn conviene migrarlo. `checkboxClass` en `form-ui.tsx` puede quedar sin uso.
- [nit] `hours-form.tsx:122`: las etiquetas "Turno mañana: abre" / "Turno tarde: abre" son largas para una columna de ~118px a 360px; si truncan, la etiqueta pierde sentido. → `truncate` en el Label o usar "Mañana"/"Tarde".

## Revisado
Editor de horarios: dos inputs `time` lado a lado con `flex-1 min-w-0` y botón de quitar de 44px (cabe a 360px), tokens shadcn y objetivos táctiles h-11; landing: `tabular-nums`, `text-right` y resaltado de hoy intactos.
