ESCALATE

**Motivo:** Las 4 reviews y los checks pasan, pero reproduje un incumplimiento de AC-6c: si se toca Registrar enseguida de escribir el teléfono, el corte siguiente muestra el cliente anterior y se guarda sin cliente.

## Notas
- **Defecto (AC-6c, "registrar con éxito lo limpia").** En `src/app/(dashboard)/dashboard/today/walk-in-sheet.tsx`, `onSuccess` vacía el borrador pero no cancela `timer` ni limpia `latestPhone`. La búsqueda de cliente (350 ms) que sale durante el envío vuelve después del éxito, pasa la comparación con `latestPhone` y escribe `customer` en el borrador ya vacío.
- **Reproducido** en Chrome 402×874 contra `pnpm build` + `pnpm start` en 3001 y `barber_job_030`, con un teléfono de un cliente existente. Falló en 6 de 6 corridas tocando Registrar 0, 150 o 250 ms después de escribir (con latencia 0 y 400 ms). Con 320, 450 y 900 ms quedó limpio (6 de 6).
- **Consecuencia.** Al reabrir la hoja dice "Cliente · Juan Acosta" con el teléfono vacío. Registrar así crea el corte con `customerId` nulo aunque la pantalla muestre un cliente. El primer corte se guarda bien; no hay corte duplicado ni cambia el importe, y no cruza barberías. En la `walk-in-form.tsx` de `main` no pasa, según el código: el formulario se remonta con `resetKey` (no lo ejecuté en `main`).
- **Por qué no lo cubrió la evidencia.** `panel-check` y las reviews esperan a que aparezca el cliente antes de registrar. Es una ventana angosta, así que un humano puede considerarlo aceptable. Recomiendo rework, es chico.
- **Arreglo sugerido.** En `onSuccess`: cancelar el timer, poner `latestPhone.current = ""` y `setSearching(false)`. Sumar el recorrido a `panel-check` (escribir teléfono, tocar Registrar a los 100 ms, reabrir y verificar hoja vacía y `customerId` del corte siguiente).
- **Qué verifiqué y está bien** (HEAD dcd2077): lint, typecheck, test (520) y build en verde; `panel-check` completo 859/0 con salida 0; `booking-smoke` y `cash-smoke` en 0; 44 archivos, todos dentro de Target Files; archivos protegidos sin diff (actions, auth, proxy, schema, dependencias, `components/ui`, `globals.css`, `app/layout.tsx`).
- **Áreas sensibles.** No toca autenticación, sesiones, schema, dependencias, borrado de datos ni variables de entorno. `PanelGate` y `BillingGate` siguen cortando el panel, y `logout` solo cambió de lugar.
- **Nits de las reviews, opcionales en el mismo rework.** Nombre del barbero cortado en la fila y repetido para el propio barbero; scroll al abrir "Cliente" a 360×640; línea de ahora hasta 60 s atrasada al volver a Hoy; limitar `panel-check` a localhost.
- **Sin probar en dispositivos reales:** teclado, gesto y áreas seguras se emularon en Chrome.
- **Limpieza.** Servidor propio de 3001 apagado y tokens borrados. `panel-check`, los smokes y mi prueba dejaron datos de fixture en `barber_job_030`.
