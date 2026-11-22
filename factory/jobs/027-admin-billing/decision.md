APPROVE

**Motivo:** 4/4 PASS en la ronda 1, AC-1..AC-8 con evidencia y checks en verde; 22 archivos, todos dentro del scope, sin hot files, schema, dependencias ni secretos.

## Notas
- Scope: los 22 archivos del diff están en Target Files. No toca `src/lib/auth.ts`, `src/proxy.ts`, `prisma/**`, `package.json`/`pnpm-lock.yaml`, `src/components/ui/**` ni variables de entorno. Tampoco toca `src/server/billing.ts`, `src/lib/mercadopago.ts`, `src/lib/billing.ts` ni el webhook, que estaban fuera de alcance. No borra datos.
- Foco n.º 5: si `cancelPreapproval` falla, la acción vuelve sin escribir nada (cubierto por AC-2 y AC-3, con el orden de llamadas verificado). `updateBarbershop` ignora `planExpiresAt` del lado del servidor cuando el cobro está activado (AC-5). `recordPayment` se importa pero no se re-exporta desde el archivo "use server".
- Las 6 acciones siguen el orden Zod → `getAdminSession()` → DB/MP. Los errores llegan a la UI como mensajes genéricos.
- Cambio de comportamiento buscado: las barberías nuevas nacen con `billingEnabled=true`, o sea AWAITING_FIRST_PAYMENT, y su landing no se publica hasta el primer pago.
- Nits para un job de seguimiento, ninguno bloquea:
  - (security) Dos "Regenerar link" simultáneos pueden dejar un preapproval vivo en MP sin referencia local. Se arregla con `updateMany` condicionado al `mpPreapprovalId` leído.
  - El `update` a `mpStatus="cancelled"` cuando el create falla no tiene try/catch.
  - (ux) Los formularios pierden lo tipeado si MP devuelve error.
- Antes del uso real conviene probar en un navegador los `window.confirm` (regenerar, activar y desactivar), que no se probaron. Queda pendiente el smoke test en el sandbox de MP, que estaba fuera de alcance.
