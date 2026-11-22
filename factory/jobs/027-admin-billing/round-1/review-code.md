VERDICT: PASS

## Hallazgos
- [nit] `src/server/actions/admin-billing.ts:88,161,209`: `shop.mpPreapprovalId!` repetido. Es seguro en runtime porque `hasLivePreapproval` lo garantiza, pero el `!` oculta el null → hacer que `hasLivePreapproval` sea un type guard (`shop is T & { mpPreapprovalId: string }`) y sacar los `!`.
- [nit] `src/server/actions/admin-billing.ts:106`: el `db.barbershop.update` de `mpStatus="cancelled"` tras fallar el create no está en try/catch. Si falla, la acción lanza en vez de devolver el error genérico → envolverlo y loguear.
- [nit] `src/server/actions/admin.ts:~227`: `billingEnabled` se lee antes de la transacción de `updateBarbershop`. Si se activa el cobro en el medio hay una ventana mínima para pisar `planExpiresAt`. Es un riesgo teórico y aceptable.

## Revisado
lint ✅ · typecheck ✅ · test ✅ (30 archivos, 485 tests) · build ✅ · scope ✅ (22 archivos, todos dentro de Target Files) · AC-1..AC-8 ✅

Revisé las 6 acciones. Cada una hace Zod → `getAdminSession()` → DB o MP, en ese orden. Foco n.º 5: si MP falla al cancelar, no se aplica ningún cambio local. Al regenerar, el cancel va antes del create. Los errores de MP y de `recordPayment` se loguean y a la UI llegan mensajes genéricos. `markDuplicateReviewed` filtra por `barbershopId`. El monto viaja como string. Se invalida el tag del branding al activar, desactivar o registrar un pago. `updateBarbershop` ignora `planExpiresAt` del lado del servidor. No hay schema ni dependencias nuevas.

Los AC-6 y AC-7 (UI) los tomé de la verificación manual de `build.md`. No los reproduje en un navegador.
