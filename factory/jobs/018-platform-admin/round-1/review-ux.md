VERDICT: PASS

## Hallazgos
- [nit] `src/app/admin/(panel)/barbershops/[id]/page.tsx:83`: la descripción de "Acceso del dueño" explica que el link nuevo invalida los anteriores, pero no dice que es un link de restablecimiento (el dueño va a tener que elegir una contraseña nueva) → agregar "Al usarlo, el dueño elige una contraseña nueva" y, si querés, un confirm antes de generarlo si el dueño ya tiene contraseña.
- [nit] `src/app/admin/(panel)/barbershops/[id]/status-form.tsx:9`: la confirmación de suspender usa `window.confirm` (nativo, no estilizado). Funciona y cubre el caso destructivo; un diálogo propio sería más prolijo. Reactivar sin confirmación está bien.
- [nit] `src/app/admin/(panel)/page.tsx:70`: el vencimiento del plan se muestra como texto gris, sin destacar los vencidos o por vencer → resaltar con color/badge ("Vencido", "Vence pronto") para escanear el listado.
- [nit] `src/app/admin/(panel)/barbershops/new/create-form.tsx:33`: el slug no se autocompleta desde el nombre → sugerir slug al tipear el nombre (ahorra un campo a mano).
- [nit] `src/app/(dashboard)/layout.tsx:43`: el banner "Tu plan vence el X." / "Tu plan venció el X, contactá al administrador." distingue vencimiento próximo de vencido (rojo) y solo se calcula para OWNER; el banner de "vence" no dice cómo renovar → sumar "contactá al administrador" también ahí.

## Revisado
Alta de barbería + dueño en un solo formulario (4 campos + 1 envío = 5 toques con teclado; link con copiar/WhatsApp en la misma pantalla con aviso explícito de que no se vuelve a mostrar, vence en 48 h y es de un solo uso); estados de carga/error/éxito con botones deshabilitados mientras se envía y errores junto al campo; suspender con confirmación, aviso de slug viejo en el campo, mensaje de suspendida claro en /login (en el login y vía `?suspended=1`); banner de plan solo para dueños, no para barberos; copy en rioplatense y fechas en la timezone de la barbería.
