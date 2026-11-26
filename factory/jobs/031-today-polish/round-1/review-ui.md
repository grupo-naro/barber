VERDICT: PASS

## Hallazgos
- [nit] `src/app/(dashboard)/dashboard/today/today-board.tsx:~114`: cuando `appointmentTag` devuelve `null` (barbero, turno propio) la grilla `[3.875rem_minmax(0,1fr)_auto]` conserva la tercera columna vacía y su `gap-2.5`, así que el nombre del cliente pierde 10 px a la derecha frente a una fila con etiqueta. No rompe nada (en la captura de 402 "Maximiliano Bartolomé Fernández …" sigue legible) → si se quiere ganar ese espacio, grilla de dos columnas cuando no hay etiqueta.
- [nit] `today-board.tsx` (nombre del barbero en "Listo"): con nombre larguísimo el servicio queda en "Corte, …" a 360; es lo que pide el spec (se recorta primero el servicio), solo lo dejo anotado.
- Sin bloqueantes. Con tokens (`text-muted-foreground`, `bg-card`, `toneClass`), `tabular-nums` en la hora, badge/color de estado sin cambios ("Sin asignar" acento, "Listo"/"No vino" apagados), sin colores crudos ni componentes reinventados; el modo oscuro no se toca (solo clases con tokens). No hay imágenes ni landing `/[slug]` en el diff.

## Revisado
Diff completo de UI (today-board, walk-in-sheet, appointmentTag) y capturas propias en Chrome (CDP, 360x640 y 402x874, dueño y barbero) con la sección "Nombres en la agenda" de panel-check sobre barber_job_031_ui (47 verificaciones, 0 fallas): nombres normales completos a 402 y 360, nombre de 60 caracteres en dos líneas sin desborde y cliente legible, barbero sin su nombre en filas propias; no capturé el walk-in sheet ni 1366x900 por mi cuenta (cubiertos por las secciones del builder); servidor 3003 y Chrome apagados.
