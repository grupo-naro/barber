VERDICT: PASS

## Hallazgos
- [nit] `src/server/billing.ts:97`: el rama `AlreadyRecorded` usa el `planExpiresAt` leído dentro de la transacción; correcto, y el `FOR UPDATE` más el `@unique` cubren la concurrencia. Sin cambios requeridos.
- [nit] `src/server/billing.ts:50`: `currentPaidUntil` lanza si la barbería no tiene `planExpiresAt` ni pago previo. Es un caso casi imposible tras un P2002 de `mpPaymentId`; aceptable.

## Revisado
lint ✅ · typecheck ✅ · test ✅ (21 archivos, 361 tests, los de DB corren sin skip) · build ✅ · scope ✅ (6 archivos, todos en Target Files) · `prisma migrate status` al día ✅ · AC-1..AC-6 ✅

Notas: migración con `billingEnabled DEFAULT false` (sin backfill, existentes EXEMPT); `amount` como `Prisma.Decimal` desde string validado; extensión y alta del pago en la misma transacción con bloqueo de fila; día de negocio vía `businessDate` y `planExpiresAtFromDate`; sin `any` ni `@ts-ignore`.
