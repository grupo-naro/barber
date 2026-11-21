VERDICT: PASS

## Hallazgos
- [nit] `src/app/(dashboard)/dashboard/barbers/invite-link.tsx:46`: el aviso "no se vuelve a mostrar" es texto chico y gris (`text-muted-foreground`); es lo más importante de la pantalla → ponelo con más énfasis (`font-medium text-foreground`) o en un recuadro de aviso.
- [nit] `src/app/(dashboard)/dashboard/barbers/page.tsx:41`: el estado vacío de "Equipo" solo muestra al dueño; está bien, pero un barbero recién creado sin invitación vigente se distingue solo por el badge. Considerá mostrar "Link vencido" cuando la invitación pendiente expiró (hoy dice "Invitación pendiente" igual).
- [nit] `src/app/(auth)/invitacion/[token]/accept-form.tsx:44`: el campo "Repetí la contraseña" no tiene `minLength` ni ayuda; es consistente con el primero, sin problema, solo notar que `minLength` con `noValidate` no se aplica (la validación real es del servidor, y está inline).
- [nit] `src/app/(dashboard)/dashboard/barbers/invite-link.tsx`: el botón de WhatsApp es un `<a>` con `href` indefinido hasta que hay origen; es un instante, no bloquea.

## Revisado
Alta de barbero: 3 toques (Nombre, Email, "Crear e invitar") y luego 1 toque más para "Enviar por WhatsApp" o "Copiar" (mensaje en español rioplatense prefilled, feedback "Copiado" con aria-live y fallback si falla el portapapeles). Aceptar invitación: 3 toques (contraseña, repetir, "Activar mi cuenta") y redirige a /dashboard/today; se muestra el nombre de la barbería y el saludo, la regla de 8 caracteres está visible de entrada, errores inline, botón deshabilitado en pending. Link vencido o usado: "Pedile uno nuevo a tu barbería" con botón a ingresar. Estados pendiente/activo/dueño/inactivo con badges; liquidación con selector %/alquiler fijo, sufijos "%" y "$" y explicación; "Mi cuenta" en el header para ambos roles (≥44px, ícono solo en mobile con aria-label). Inputs h-11, labels, skeletons y estados de error presentes. No encontré bloqueantes.
