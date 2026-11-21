VERDICT: CHANGES

## Hallazgos
- [blocking] `src/app/[slug]/booking-section.tsx:32`: `choiceClass` usa `px-3 py-2 text-sm` (~36-38px de alto). Lo usan los chips de barbero (l.112/123), los días (l.145) y los horarios (l.277), o sea los toques más repetidos del flujo en el celular; quedan bajo los 44px táctiles → agregar `min-h-11` a `choiceClass` (y `min-h-11` en el `SlotsSkeleton`, l.226, que hoy es `h-9`, para evitar salto de layout).
- [nit] `src/app/[slug]/booking-section.tsx:~277` y `booking-form.tsx`: con `scroll={false}`, al tocar un horario el formulario "Tus datos" aparece debajo de la grilla y puede quedar fuera de pantalla sin aviso → un `id` en el form y un scroll/focus al primer campo al montarse (o `scroll` al ancla), así el pulgar no tiene que buscarlo.
- [nit] `src/app/[slug]/booking-section.tsx:~100`: el paso 2 no tiene default; "Cualquiera" podría venir preseleccionado (ahorra 1 toque en el caso más común).
- [nit] `src/app/[slug]/booking-form.tsx:~82`: el nombre no tiene `inputMode`/`enterKeyHint`; el error de validación del servidor sale arriba del botón, no junto al campo (aceptable porque hay `required`/`minLength` nativos; mejorable si el error es de teléfono).
- [nit] `src/app/[slug]/booking-form.tsx:~35`: tras confirmar, la grilla de horarios sigue mostrando el horario recién reservado hasta recargar; ocultar o refrescar con `router.refresh()`.

## Revisado
Cuenta de toques para reservar: servicio (1) → barbero (2) → día (3) → horario (4) → completar nombre y teléfono (2 campos) → "Confirmar reserva" (5) = 5 toques + 2 campos; sin defaults inteligentes (barbero y día sin preselección). Positivo: copy en español rioplatense, precios en ARS vía `Intl`, horas en hora local, `inputMode="tel"` y `autoComplete`, labels, foco visible, `aria-current`, botón deshabilitado con "Reservando…" (sin doble envío), skeletons de carga, estados de cerrado/sin turnos y de horario ya no disponible, y confirmación con resumen.
