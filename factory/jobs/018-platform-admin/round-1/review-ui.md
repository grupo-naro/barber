VERDICT: CHANGES

## Hallazgos
- [blocking] `src/app/admin/(panel)/page.tsx:~85` (y `barbershops/[id]/page.tsx:48`): la columna Plan es texto plano y un plan vencido no se distingue de uno vigente. El pedido del owner era resaltar fechas vencidas, y en el detalle el plan es un `Badge` mientras que en la tabla es texto. → Usar `<Badge variant="outline">{PLAN_LABELS[plan]}</Badge>` en ambos lugares. Si `planExpiresAt < now`, mostrar "vencido DD/MM/AAAA" con `text-destructive font-medium` (o un Badge destructive), con la misma regla en el detalle. Reutilizar `planBanner` o una comparación de fechas.
- [nit] `admin/(panel)/page.tsx`: la tabla usa `min-w-[960px]` dentro de `overflow-x-auto`, que es un fallback válido en pantallas chicas. Las fechas de la columna Plan y de Última actividad podrían llevar `tabular-nums`.
- [nit] `admin/(panel)/layout.tsx`: en 360px el nav (3 links) y el botón "Cerrar sesión" pueden apretarse. Agregar `flex-wrap` al header.
- [nit] El banner del plan en `(dashboard)/layout.tsx` es coherente con las alertas existentes: usa tokens, `role=status` y modo oscuro OK. El aviso de suspensión en `/login` usa el mismo patrón destructive. La landing suspendida devuelve null, o sea el 404 estándar, lo cual es aceptable.

## Revisado
Tabla y layout del admin, login admin (consistente con /login: Card + tokens), banner del plan en el dashboard y aviso de suspensión. Sin servidores levantados.
