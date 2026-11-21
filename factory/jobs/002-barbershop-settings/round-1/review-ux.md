VERDICT: PASS

## Hallazgos
- [nit] `src/app/(dashboard)/dashboard/settings/hours-form.tsx:80`: al destildar "Cerrado" en un día que estaba cerrado, Abre/Cierra quedan vacíos y hay que cargar dos pickers a mano → precargar un default (ej. 09:00–20:00 o el horario del día anterior) al reabrir.
- [nit] `hours-form.tsx`: cargar 7 días son hasta 14 pickers en el celular; falta un atajo "Copiar a todos los días" / "Copiar de lunes".
- [nit] `hours-form.tsx:50`: el checkbox "Cerrado" va a la derecha del nombre del día y el estado cerrado solo se nota por los inputs deshabilitados; un texto "Cerrado" en lugar de los pickers sería más claro.
- [nit] `payout-form.tsx:97`: la regla ya queda explicada en "Actual: 50 % de lo facturado / Alquiler fijo de $120.000" y el label cambia (Porcentaje (%) / Alquiler ($)), pero no hay ayuda de qué significa cada esquema (ej. "alquiler fijo: el barbero paga una suma por período y se queda con todo lo que factura"; el período no se aclara) → agregar una línea de ayuda debajo del select.
- [nit] `payout-form.tsx`: un botón "Guardar" por barbero, con feedback propio ("Liquidación guardada.") en región aria-live; correcto, pero el mensaje de éxito queda sin estilo de éxito (mismo gris que el texto auxiliar).

## Revisado
Pantalla de configuración del dueño en mobile: controles de 44px (h-11), checkbox de 20px dentro de label de min-h-11, `inputMode="decimal"` en valores de liquidación, labels y errores por campo con aria-describedby, botón deshabilitado y "Guardando…" mientras guarda (sin doble envío), mensajes de éxito/error en aria-live y skeleton de carga; copy en vos/es-AR con ARS formateado. Cuenta de toques: editar un día de horario = 3 toques (abrir picker, elegir hora, confirmar) por campo + 1 para guardar; cambiar una liquidación = select (1) + valor (1-2) + Guardar (1) = 3-4.
