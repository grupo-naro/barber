VERDICT: PASS

## Hallazgos
- [nit] `src/app/(dashboard)/dashboard/today/today-board.tsx:127`: el nombre del barbero en la fila se corta a ~112 px (`max-w-28`) en celular ("Lucas Fernánd…"); con apellidos largos queda ambiguo entre dos barberos → dar más ancho a la etiqueta o mostrar solo el nombre de pila a 360 px.
- [nit] `today-board.tsx:117`: la hora en Anton (`panel-display`) no lleva `tabular-nums`; "18:00" y "21:00" miden distinto (la columna sí queda alineada a la izquierda) → sumar `tabular-nums`.
- [nit] Caja, Servicios, Barberos y Ajustes tienen el encabezado nuevo pero el cuerpo conserva tarjetas, "Desactivar" rojo por fila en Servicios y cajas dentro de tarjetas en Caja. Coherente con "tanda 1: base y Hoy"; queda para la tanda 2.

## Aclaración de lo que había quedado dudoso
- "Caja con Verde y dorado mostró Hoy": era mi script (esperaba 3,5 s fijos y capturaba antes de que cambiara la ruta). Repetida esperando URL `/dashboard/cash` y `h1` "Caja" visible (filtrando por `getClientRects`), a 402×874 con Verde y dorado: renderiza Caja bien (encabezado negro, "Abierta", pestaña Caja activa, sin desborde). No es un defecto del producto.
- "Turnos distintos de los sembrados": la base ya traía 9 turnos de hoy propios además de mis `ui-*`, y en la tabla se mezclaron. Verificado: 9 turnos visibles en Hoy, ordenados por hora. Tampoco es un defecto.
- El `scrollWidth` 749 con vista de 402 salió una sola vez, en una captura donde la hoja no llegó a abrirse (mismo problema de espera). En las demás capturas no hay desborde horizontal.

## Revisado
Hoy como dueño y barbero, paleta por defecto y Verde y dorado, hojas de corte sin turno y de turno, a 360×640, 402×874 y 1366×900, más Caja/Servicios/Barberos/Ajustes a 402 y la landing, comparado con la maqueta A. Se usan componentes y tokens de shadcn bajo `.panel-theme`; 4 turnos y el botón "Registrar corte" visibles a 402 y a 360; hora y estado se leen de un vistazo; contraste correcto; la landing no tiene `.panel-theme`. No revisé modo oscuro (no objetivo del diseño).
