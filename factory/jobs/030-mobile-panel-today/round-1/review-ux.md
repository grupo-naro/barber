VERDICT: PASS

## Hallazgos
- [nit] `src/app/(dashboard)/dashboard/today/today-board.tsx`: en el celular del barbero, las filas pendientes repiten su propio nombre a la derecha ("Martín Gómez"), que no aporta nada → mostrar la etiqueta del turno o dejarlo vacío cuando el usuario es BARBER.
- [nit] `src/app/(dashboard)/dashboard/today/today-board.tsx`: a 402 px el barbero del dueño se corta ("Lucas Fernánd…") → achicar la hora o permitir dos líneas.
- [nit] `src/app/(dashboard)/dashboard/today/walk-in-sheet.tsx:191`: a 360×640 al abrir "Cliente (opcional)" los campos quedan debajo del pliegue y no se hace scroll solo → `scrollIntoView` del bloque al abrirlo.
- [nit] `walk-in-sheet.tsx`: el medio de pago arranca siempre en Efectivo; no recuerda el más usado. Aceptable en esta tanda.

## Revisado
Usado en Chrome por CDP (402x874, 360x640, 1366x900) como dueño y como barbero, con `next start` en 3001 y la base barber_job_030_ux. Corte walk-in: 3 toques (Registrar corte, servicio, Registrar $X). Completar un turno: 2 toques (fila, Completar $X). Defaults: barbero actual, hoy, Efectivo. Cliente opcional y oculto. Botones de la hoja de 44 px o más y campos de 16 px; teléfono con `inputMode="tel"`. Sin desborde horizontal a 360. Esqueletos propios con red lenta, y la pestaña destino se marca al instante. Sin conexión, la hoja queda abierta, con el error en rojo y los datos intactos. Aviso de éxito en español. Precios en ARS. Escritorio sin regresiones. No probé teclado ni gestos en un teléfono real. Servidor (PID 9208) y Chrome (PID 6520) apagados.
