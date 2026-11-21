VERDICT: PASS

## Hallazgos
- [nit] `src/app/(auth)/login/login-form.tsx:22,32,43`: inputs y botón "Ingresar" con `h-10` (40px), por debajo de los 44px táctiles → usar `h-11`.
- [nit] `src/app/(dashboard)/layout.tsx:20`: "Cerrar sesión" usa `size="lg"` (h-9, 36px) y ocupa ancho en 360px junto al nombre de la barbería → `h-11` y, en móvil, solo ícono con `aria-label` si falta espacio.
- [nit] `src/app/(dashboard)/dashboard/page.tsx:13`: el copy muestra "Rol: OWNER (Dueño/a) · Barbería Demo (barberia-demo)", mezcla el enum crudo con el slug; en producto real conviene solo "Dueño/a · Barbería Demo" (la spec igual pide mostrar OWNER/BARBER, así que es opcional).
- [nit] `src/app/(auth)/login/login-form.tsx:20`: agregar `autoCapitalize="none"` y `spellCheck={false}` al email; marcar `aria-invalid` y `aria-describedby` hacia el `role="alert"` cuando hay error.

## Revisado
Login: 3 toques (email, contraseña, Ingresar) con autocomplete correcto, estado pending ("Ingresando…" y botón deshabilitado), el email se conserva tras el error, error genérico en vos y `role="alert"`, labels asociados, foco visible de shadcn, tarjeta responsive `max-w-sm` con `px-4`. Dashboard: header con skeleton de carga. Sin flujo de turnos/cobros en este job.
