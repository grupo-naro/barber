VERDICT: PASS

## Hallazgos
- [nit] `src/app/(dashboard)/dashboard/services/bulk-price-form.tsx:~150`: el redondeo no está explicado. Las opciones "A $500" / "A $1000" no dicen que es al múltiplo más cercano (mitades hacia arriba) ni que se aplica después del ajuste → agregar un texto de ayuda bajo el select, por ejemplo "Redondea al múltiplo más cercano después del ajuste" (el paso de vista previa ya muestra el resultado final).
- [nit] `bulk-price-form.tsx` (canReview): con "Elegir servicios" y ninguno tildado, "Ver vista previa" queda deshabilitado sin ninguna explicación → mostrar "Elegí al menos un servicio" y/o un helper "Ingresá un monto" cuando el botón está deshabilitado.
- [nit] `bulk-price-form.tsx` (review): el estado "Subir/Bajar" más el signo sólo viaja en el input oculto; en la vista previa no hay un resumen en texto del ajuste (ej. "Subir 10 %, redondeo a $500") → sumar esa línea arriba de la lista para confirmar con claridad antes de aplicar.
- [nit] `services/page.tsx`: editar un solo precio desde el celular requiere Editar → pantalla completa con 6 campos, y el precio queda debajo del fold (nombre y descripción primero) → considerar, más adelante, edición rápida del precio en la fila o hacer foco en el campo precio.
- [nit] `services/page.tsx`: la tarjeta "Actualizar precios" queda al final de una lista larga de servicios; en el celular puede costar encontrarla → un ancla o botón "Actualizar precios" arriba.

## Revisado
Actualización masiva: tipo (1) + dirección (1) + monto (teclado decimal) + redondeo (1) + vista previa (1) + confirmar (1) = unos 5 toques más el monto. Preview con precio viejo → nuevo por servicio, con conteo de cambios y bloqueo si no hay cambios o si hay un precio demasiado alto. Hay un paso de confirmación explícito y todos los controles tienen 44 px o más (min-h-11 / h-11, checkboxes size-5 dentro de filas de 44 px). Hay labels, errores junto al campo, estado pendiente que evita doble envío y copy en voseo con precios en ARS. Edición de un precio individual: Editar → precio → Guardar, 3 toques más el tipeo, con inputMode="decimal".
