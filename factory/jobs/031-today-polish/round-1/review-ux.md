VERDICT: PASS

## Hallazgos
- [nit] `src/components/panel/use-sheet-action.ts` / `src/components/panel/sheet.tsx` (preexistente, ya declarado en build.md; no bloquea esta ronda porque existe igual en `main` y está fuera del scope): "Registrando…" trabado. Lo reproduje como dueño a 402x874, con `next start` del build del job. Registrar un corte y tocar "Registrar corte" en la ventana en la que la hoja se está cerrando (unos 100 ms) reabre la hoja ya vacía pero con el botón en "Registrando… [disabled]". La X no la cierra, reabrir tampoco, y solo sale recargando la página. Pasó en 4 de 8 intentos, tocando cada 15 ms durante 900 ms. Con un toque único a 40, 100, 200 y 300 ms tras Registrar, la hoja reabrió bien y el siguiente corte se registró. Con un uso humano normal es raro: hay que tocar "Registrar corte" dentro de unos 100 ms del cierre, por ejemplo con un doble toque ansioso en una red lenta. Si pasa, el barbero queda sin poder registrar hasta recargar. No duplica cortes ni muestra datos del cliente anterior. Gravedad: media-baja, pero es un callejón sin salida en la acción principal. Conviene un job propio con `reset` al terminar el cierre, o dejar de bloquear la apertura mientras la hoja se cierra.
- [nit] Preexistente y fuera de scope: `normalizePhone` solo saca los no-dígitos. El placeholder "11 2345-6789" invita a escribir sin el 54 9, y eso no encuentra a un cliente cargado como `5491177000001` (se queda en "Nombre (cliente nuevo)"). Los clientes del seed dev (`+549…`) tampoco se encuentran por la misma razón. Los clientes de `panel-check` sí, porque son solo dígitos. No es regresión del 031.
- [nit] El mensaje de "Registrando…" trabado no tiene salida visible (ni error ni reintento). Si se arregla la causa, alcanza.

## Revisado
Como dueño a 402x874 y 360x640, y como barbero a 360x640. Chrome por CDP, con touch emulado, contra el build del worktree en la base `barber_job_031_ux`.

Cuenta de toques, corte walk-in:
- Mínimo: 3 toques (Registrar corte, servicio, Registrar). El medio queda en Efectivo y el barbero en "vos".
- Con cliente existente: 5 toques más el teléfono (Cliente (opcional), campo, escribir el teléfono, Registrar). El nombre no se pide cuando el cliente ya existe.
- Defaults correctos. El medio de pago no se recuerda, y el spec lo deja fuera.

Dos cortes seguidos con el mismo teléfono existente (5491177000001):
- Registrar y reabrir a 0, 120 y 400 ms dejó la hoja nueva con teléfono vacío, "Cliente (opcional)", sin "Ver ficha" y sin "Buscando cliente…".
- El segundo corte quedó limpio y no quedó pegado el cliente anterior.
- El fix de AC-1 se comporta bien con un uso humano.

Mobile y accesibilidad a 360x640:
- "Registrar corte" mide 56 px y queda al alcance del pulgar. Los chips de pago miden 44 px, el toggle de Cliente 48 px y los campos 48 px.
- Teléfono con `inputMode=tel`, sin desborde horizontal (`scrollWidth` 402 / 360).
- Al abrir Cliente, Teléfono y Nombre quedan enteros por encima del botón fijo (top 395 y 485, bottom 533, alto de ventana 640). No se abre el teclado.
- Labels visibles y copy en voseo ("Elegí un servicio", "Todavía no hiciste cortes hoy", "$15.000,50").

Agenda a 402x874:
- Las filas del dueño se ven bien: "Martín Gómez" completo, "Sin asignar" y "Listo" legibles.
- El nombre larguísimo del cliente se recorta con "…".
- Las horas están en Anton y la línea de ahora marca 22:27.
- Barbero a 360x640: sus filas no repiten su nombre y "Sin asignar" se ve igual que antes.
- No verifiqué la fila `chk-apt-3` del barbero por captura: ese día el barbero no tenía turnos propios en la base.

No probé teléfono real ni segunda pestaña real.

Apagado: server 3001 (PID 852) cerrado y 0 procesos Chrome del puerto 9333. Dejé en `barber_job_031_ux` el cliente `ux-cus-1` ("Rodrigo Ux") y unos 55 `ServiceRecord` de mis pruebas. Son descartables.
