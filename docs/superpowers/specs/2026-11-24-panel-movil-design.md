# Panel interno pensado para el celular

Fecha: 2026-11-24. Estado: pendiente de aprobación del dueño.

Maquetas (abrir en el navegador): [Hoy, tres caminos](2026-11-24-panel-movil/hoy-tres-caminos.html) (se eligió la **A**) y [panel completo](2026-11-24-panel-movil/panel-completo.html). Si una maqueta y este documento se contradicen, vale el documento.

## Intención

El panel se va a usar alrededor del 80% en celular, y cada barbero va a entrar con su propio login. Tiene que sentirse como una app: rápida, linda y cómoda con una mano entre corte y corte. El sistema todavía no está en uso, así que no hay costumbres que respetar.

## Qué se ve hoy (medido a 402×874 con datos de prueba)

- **Hoy** mide 3.303 px. Arriba está el formulario del corte sin turno, con su botón fuera de la primera pantalla; los turnos quedan abajo.
- **Ajustes** mide 4.635 px, con 67 controles y 5 formularios en una página.
- **Servicios** muestra 3 por pantalla, con "Desactivar" en rojo en cada fila.
- Encabezado fijo con nombre, rol y "Cerrar sesión". Precios con centavos. Estética sin marca.
- Ya está bien: barra inferior, áreas táctiles de 44 px, sin desborde horizontal, páginas livianas.

## Objetivos

1. "Registrar corte" visible sin scroll a 360×640, y un corte sin turno en 3 toques: Registrar corte, servicio, Registrar.
2. Al abrir Hoy a 402×874 se ven por lo menos 4 turnos.
3. Las acciones se abren en una hoja y al cerrarla se vuelve al mismo lugar del scroll.
4. Tocar una pestaña marca el destino al instante y muestra el esqueleto de esa pantalla; nunca queda en blanco.
5. La misma estética en las 5 secciones, con los colores de cada barbería.

## No objetivos

- Cambiar reglas, permisos, cálculos, textos legales o el schema. Sin migraciones.
- La landing, `/login`, `/invitacion` y `/admin`.
- Modo oscuro, modo sin conexión, notificaciones, e instalar la app en el inicio del teléfono (buena idea para después).
- La regla del alquiler fijo (009), reabrir cierres (010) y la visibilidad del historial (011). La Caja muestra lo que el servidor calcula hoy; el monto de Nico en la maqueta es de relleno.

## Anti-objetivos (fallaría aunque funcione)

- Que se registre un corte, se cierre la caja o se pierda un link de invitación por un toque o un deslizamiento sin querer.
- Que la animación demore una acción, o que se muestre como guardado algo que el servidor todavía no confirmó.
- Que una barbería no pueda leer algo por los colores que eligió.
- Que en la computadora se vuelva peor que hoy.

## Caminos

Cómo abre el día el barbero:

| Camino | A favor | En contra |
|---|---|---|
| **A. Agenda (elegido por el dueño)** | Se ve el día entero; el botón está siempre | Un toque más para un corte sin turno |
| B. Mostrador | La más rápida sin turno | La agenda queda abajo |
| C. Sillón | La más clara con las manos ocupadas | Supone un orden, y se atiende por orden de llegada |

Cómo se arma la hoja (decisión de quien construye, sin dependencias nuevas): `Drawer` de `@base-ui/react`, ya instalado. Da foco atrapado, Escape, botón cerrar y deslizar para cerrar. Un `<dialog>` propio obligaría a escribir el gesto; rutas interceptadas de Next agregan URLs y estados de carga que no hacen falta.

## Decidido por el dueño

- Camino A, y el panel completo tal como está en la segunda maqueta.
- Uso principal en celular, y un login por barbero.

## Propuesto y mostrado en la maqueta (aprobado con "está bien")

Hojas desde abajo; Caja en segundo lugar; Ajustes como menú; "Desactivar" adentro del servicio; "Cerrar sesión" en Mi cuenta; precios sin centavos salvo que tengan; colores de cada barbería; construcción en tres tandas.

## Diseño

### Base visual
- Encabezado negro por pantalla: título en **Anton** y una línea de contexto (fecha, estado o cantidad). Se suma con `next/font` solo en el layout del panel. El cuerpo sigue en Geist. Anton se usa en títulos, horas y el total de Caja; nada más.
- Fondo frío claro, listas blancas a todo el ancho con línea divisoria, sin tarjetas dentro de tarjetas.
- **Colores:** `--primary` de acción = color secundario de la barbería; el principal se usa en "Sin asignar", selección y el total de Caja. Salen de `brandPalette` (`src/lib/brand-colors.ts`), que ya garantiza texto blanco legible. Se leen con una consulta propia en el layout, sin tocar `src/lib/auth.ts`. Con valores nulos, azul y rojo.
- **Peligro y errores usan un rojo fijo**, no el de la marca (en la maqueta se pintaban con la marca: no copiar). Para no confundirse con el botón rojo por defecto: la acción principal es un botón sólido; la peligrosa es texto sin fondo y siempre pide confirmación. "Pendiente" va en ámbar oscuro legible.
- La franja del poste aparece una sola vez: en la línea de "ahora".

### Navegación
- Dueño: Hoy, Caja, Servicios, Barberos, Ajustes. Barbero: Hoy, Mi cuenta. Barra fija abajo con `safe-area`; desde 640 px queda arriba como hoy.
- Pestaña activa al instante (`useLinkStatus` o equivalente según `node_modules/next/dist/docs/`), y un esqueleto con la forma de cada pantalla.
- Avatar con iniciales en Hoy, que lleva a Mi cuenta. El dueño también llega desde Ajustes.
- El aviso de cobro (`GRACE`) y el del plan siguen arriba, y `BillingGate` sigue igual con la estética nueva. Mi cuenta y cerrar sesión siguen disponibles con el panel bloqueado.

### Hoja
- Sube hasta 92% del alto; el contenido scrollea y la acción principal queda fija abajo, por encima del teclado. Desde 640 px es un diálogo centrado.
- Se cierra con ✕, Escape, tocando afuera o deslizando. **Excepciones:** mientras guarda no se cierra; la hoja con el link de invitación solo se cierra con el botón "Ya lo copié o lo mandé".
- Con error queda abierta, con el mensaje adentro y los datos cargados. Con éxito se cierra y aparece un aviso de 3 segundos con `role="status"`. Nada se muestra como guardado antes de la respuesta del servidor; el botón pasa a "Registrando…" en el momento y no admite doble envío.
- Movimiento de hasta 300 ms. Con `prefers-reduced-motion`, sin movimiento.

### Hoy
- Resumen en una frase: barbero "Hiciste N cortes por $X", dueño "La barbería lleva N cortes por $X". Tocarla abre la **lista de cortes del día** con lo que hoy se ve en "Cortes de hoy" (número, hora, barbero, cliente, servicios, medio y total).
- Turnos en orden de hora y, en la misma hora, por orden de reserva. Cada fila: hora, cliente, servicio y una etiqueta: "Sin asignar", "Listo", "No vino" o "Cancelado"; si está asignado, el nombre del barbero. El "Esperando" de la primera maqueta no va: no hay dato que lo respalde. Los terminados se ven atenuados, en su lugar.
- **Línea de ahora:** antes del primer turno cuya hora (inicio + 1 h) no terminó. Sin turnos posteriores, al final. Se mueve cada minuto, en la zona horaria de la barbería.
- Tocar un turno abierto abre la hoja: notas del cliente, servicios (el reservado ya marcado, aunque esté desactivado), medio de pago, "¿Quién atendió?" solo para el dueño, Completar, Llamar, Ver ficha, y "No vino" / "Cancelar" con confirmación. Tocar uno terminado abre el detalle, sin acciones.
- "Registrar corte" abre la hoja del corte sin turno con todo lo actual: varios servicios, medio de pago, barbero (dueño), y cliente opcional con búsqueda por teléfono, nombre, notas y ficha. Si se cierra sin registrar, lo elegido se conserva hasta salir de Hoy.
- Día cerrado: en lugar del botón, "La caja de hoy ya está cerrada". Sin servicios: el dueño ve un enlace a Servicios; el barbero, "Pedile al dueño que cargue los servicios".
- Al volver a la app se actualizan los datos, sin mover el scroll ni cerrar una hoja abierta.

### Caja (dueño)
- Día con flechas; tocar la fecha abre el calendario nativo. No hay días futuros.
- Total grande, cantidad de cortes, barra de proporción y los cuatro medios con su monto. La barra es decorativa: los números están siempre.
- Por barbero: acuerdo en palabras, base y monto. Saldo negativo en rojo fijo con "Debe a la barbería $X".
- "Cerrar la caja" abre la hoja con total, cantidad, quiénes quedan debiendo, notas opcionales y "Después no se puede modificar". Reemplaza a `window.confirm`. Día cerrado: solo lectura, con fecha, quién y notas. Sin cortes no se ofrece cerrar.

### Servicios
- Filas compactas: nombre, duración, precio; "Inactivo" y "Oculto online" como etiquetas, e inactivos al final.
- "Nuevo" y tocar una fila abren la hoja con el formulario actual completo; adentro, Desactivar o Reactivar. `/dashboard/services/[id]` sigue andando como URL.
- "Actualizar precios" conserva todo: porcentaje o monto, redondeo, selección, vista previa y confirmación. Por su largo va en pantalla propia, `/dashboard/services/prices`.
- Un barbero que entra por URL sigue viendo la lista sin acciones.

### Barberos (dueño)
- Filas con nombre, acuerdo en palabras y estado (Activo, Pendiente, Link vencido).
- "Invitar" abre la hoja; al crear, la misma hoja muestra el link con Copiar y WhatsApp. Tocar una fila abre la ficha con nombre, acuerdo y, si corresponde, generar un link nuevo. `/dashboard/barbers/[id]` sigue andando.

### Ajustes (dueño)
- `/dashboard/settings` pasa a ser un menú con un resumen real en cada fila: Datos de la barbería, Horarios, Fotos y redes, Colores, Ver mi página, Mi cuenta.
- Pantallas `profile`, `hours`, `photos` y `colors` debajo de `/dashboard/settings/`, con "Volver". Son los formularios actuales con las mismas acciones; `landing-form.tsx` se separa en fotos/redes y colores.
- Si hay cambios sin guardar, avisar antes de salir.
- En Horarios se suma "Copiar a todos los días" (parte del 022 del backlog).

### Precios
Un solo formateador para el panel en `src/lib/` (hoy hay tres copias): sin decimales cuando son cero, con dos cuando no. Formatea el string, sin flotantes. La landing y `/admin` no cambian.

## Restricciones

- Next 16 con `cacheComponents`: leer la guía en `node_modules/next/dist/docs/` antes de escribir. Lo que depende de la sesión va dentro de `<Suspense>`; `"use client"` solo en las hojas interactivas.
- Las validaciones, los permisos, los cálculos y `requirePanelAccess` de las Server Actions no cambian. Ocultar algo no reemplaza el permiso en el servidor. Lo único que se puede tocar en ellas es lo que pasa **después** de guardar: `services.ts` hoy redirige a la lista (línea 150) y tiene que devolver el resultado para que la hoja se cierre; `barbershop.ts` y `landing.ts` refrescan solo `/dashboard/settings` y tienen que refrescar también las pantallas nuevas.
- Sin dependencias nuevas. Áreas táctiles de 44 px o más, texto de campos de 16 px (para que iPhone no haga zoom), contraste AA, foco visible.
- Textos en español rioplatense.

## Tandas

1. **Base y Hoy:** tokens, Anton, encabezado, barra, hoja, aviso, precios y Hoy completo. Las otras secciones toman encabezado y barra, y siguen funcionando.
2. **Caja, Servicios y Barberos.**
3. **Ajustes y Mi cuenta**, con "Copiar a todos los días".

Cada una depende de la anterior y se puede publicar sola.

## Cómo se verifica

- Capturas a 360×640, 402×874 y 1366×900 de cada pantalla y cada hoja, como dueño y como barbero, con la paleta por defecto y con "Verde y dorado".
- Sin desborde horizontal a 360, ningún control de menos de 44 px, objetivos 1 y 2 medidos.
- Recorridos: corte sin turno con y sin cliente; completar, no vino y cancelar; error del servidor con la hoja abierta; doble toque en Registrar; cerrar caja; invitar y copiar el link; día cerrado; panel bloqueado por cobro; solo teclado; movimiento reducido.
- Lint, typecheck, tests, build y los smokes de reservas y caja.

## Queda a criterio de quien construye

Nombres de componentes, forma exacta de los esqueletos, tamaños y espacios dentro de lo mostrado, íconos, y los textos de ayuda que no estén fijados acá.
