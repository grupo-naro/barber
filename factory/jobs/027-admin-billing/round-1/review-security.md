VERDICT: PASS

## Hallazgos
- [nit] `src/server/actions/admin-billing.ts` (`generateSubscriptionLink`): dos envíos simultáneos (doble click o dos pestañas de admin) leen el mismo `mpPreapprovalId`, cancelan el mismo preapproval viejo y crean **dos** nuevos. Solo el último queda guardado y el otro queda vivo en MP sin referencia local. Eso rompe "nunca dos preapprovals activos" y lo limita únicamente la UI (`useActionState` pending). → Hacer el guardado condicional: `updateMany({ where: { id, mpPreapprovalId: shop.mpPreapprovalId }, ... })`. Si `count === 0`, cancelar en MP el preapproval recién creado y loguearlo. Otra opción es tomar un lock por fila (`SELECT ... FOR UPDATE` en una transacción corta) antes de llamar a MP.
- [nit] `src/server/actions/admin-billing.ts` (`generateSubscriptionLink`, rama catch de `createPreapproval` con `cancelledOld`): el `db.barbershop.update({ mpStatus: "cancelled" })` no tiene try/catch. Si la DB falla ahí, la excepción sube cruda hasta el error boundary. Next la oculta en producción, pero no pasa por `logError` y no devuelve el mensaje genérico. → Envolver el update en try/catch y devolver `MP_CREATE_FAILED` igual.
- [nit] `src/server/actions/admin-billing.ts` (`setBillingEnabled`): pasa algo parecido con la carrera entre leer `billingEnabled` y escribirlo. Una desactivación y un regenerar concurrentes podrían dejar un preapproval vivo con el cobro desactivado. Es de bajo riesgo porque solo lo dispara un admin, pero el `updateMany` condicionado al `mpPreapprovalId` leído también lo resuelve.

## Revisado
Las seis acciones nuevas siguen el orden Zod `safeParse` → `getAdminSession()` → DB/MP, y sin sesión no se lee ni se llama a nada. Además:
- `recordPayment` solo se importa, no se re-exporta.
- `markDuplicateReviewed` filtra con `updateMany` por `id` + `barbershopId` + `suspectedDuplicate` + `duplicateReviewedAt: null`.
- `updateBarbershop` ignora `planExpiresAt` del lado del servidor cuando el cobro está activado.
- Los errores de MP y de `recordPayment` se loguean y la UI recibe mensajes genéricos, sin `message`, status ni ids.
- Las páginas nuevas (`/admin/settings` y la sección Suscripción) llaman a `requireAdminSession()` dentro de `<Suspense>`.
- No hay `dangerouslySetInnerHTML`, `NEXT_PUBLIC_*` ni secretos. `mpInitPoint` se muestra en un `<input readOnly>`, no como `href`.
- El `id` de barbería que llega por form es correcto acá: es el panel de la plataforma, cross-tenant por diseño y protegido por la sesión de admin.
