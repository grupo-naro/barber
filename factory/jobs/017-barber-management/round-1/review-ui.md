VERDICT: CHANGES

## Hallazgos
- [blocking] `src/lib/dashboard-nav.ts:12` + `src/components/dashboard-nav.tsx:29`: con "Barberos" el dueño pasa a 5 ítems en la barra inferior. A 360px cada `li` mide ~72px y con `px-2` quedan ~56px de contenido, pero "Configuración" en `text-xs` mide ~75-80px, así que se desborda o pisa al vecino. Con 4 ítems entraba. → Cambiar el label a "Ajustes" (ajustar `dashboard-nav.test.ts` si lo asserta) o, como mínimo, agregar `min-w-0` al `li`, bajar a `px-1` y `truncate` al `<span>`. Verificar a 360px.
- [nit] `invite-link.tsx`: el Input `font-mono text-xs` con `readOnly` hace scroll horizontal y no se rompe la maqueta a 360px; es correcto. Los estados del botón Copiar (ícono Check, texto "Copiado", región `aria-live`) están bien. Solo falta un estado visual para el error: el mensaje es texto muted y podría usar `text-destructive`.
- [nit] `barbers/page.tsx:62-66`: "Invitación pendiente" usa `<Badge>` por defecto (bg-primary) y "Activo" usa outline. Es coherente con la ficha, pero un pendiente en color primario compite con el CTA. Considerar `variant="secondary"` para pendiente.
- [nit] `layout.tsx`: el enlace "Mi cuenta" (ghost) y "Cerrar sesión" caben a 360px porque en mobile quedan solo con ícono (`min-w-11`, 44px); aun así, el nombre del header debería seguir truncando (`min-w-0`). Se ve bien por el código.
- [nit] La página `/invitacion/[token]` replica la estructura de `/login` (main centrado, Card `max-w-sm`, tokens, `h-11`), así que es consistente. Usa solo tokens de tema, por lo que el modo oscuro funciona. El skeleton usa `h-80` fijo, lo que está bien.

## Revisado
Listado y ficha de barberos, tarjeta del link de invitación, `/invitacion/[token]`, header con "Mi cuenta" y la nav (5 ítems a 360px), por lectura de código sin ejecutar.
