VERDICT: PASS

## Hallazgos
- [nit] `src/lib/mercadopago.ts:88` y `src/app/api/webhooks/mercadopago/route.ts:24`: `asObject` está duplicado y usa `as Record<string, unknown>` tras un narrowing manual. Es aceptable, pero se podría compartir o tipar mejor.
- [nit] `src/lib/mercadopago.ts` `getPayment`: si `transaction_amount` no es numérico queda `NaN`, `toFixed` da `"NaN"` y `recordPayment` lo rechaza con un 500. Es seguro, porque no registra nada, pero MP va a reintentar.
- [nit] `getPayment` y `getAuthorizedPayment` dependen de campos supuestos (`metadata.preapproval_id`, `subscription_id`). El código lo documenta como supuesto a validar en sandbox (AC-7, no bloqueante).

## Revisado
lint ✅ · typecheck ✅ · test ✅ (25 archivos, 396 tests) · build ✅ (la ruta aparece como `ƒ /api/webhooks/mercadopago`) · scope ✅ (11 archivos, todos dentro de Target Files) · AC-1..AC-8 ✅ por lectura del código.

Puntos que sí verifiqué:
- `MpPaymentConflictError` se lanza dentro de la transacción y en el fallback P2002. Pasa por el `catch` sin convertirse en `created:false`, y su message no lleva `barbershopId` ni monto.
- El webhook devuelve 401 sin firma, 503 sin secreto, 400 si el body es inválido y 500 con un texto genérico. El detalle solo va a `console.error`.
- La barbería se resuelve solo por `mpPreapprovalId` del recurso consultado a MP.
- El monto usa `toFixed(2)`, sin aritmética flotante.
- El token y `APP_BASE_URL` se leen al llamar, no al importar.
- No hay `any`, `@ts-ignore` ni `!`.
