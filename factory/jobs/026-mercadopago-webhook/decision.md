ESCALATE

**Motivo:** 4/4 PASS y checks en verde, pero agrega variables de entorno y secretos (MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, APP_BASE_URL) y una ruta pública de cobro; decide un humano.

## Notas
- Por qué se escala: `.env.example` suma `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y `APP_BASE_URL`, y el código las lee para manejar secretos (token de MP, clave HMAC del webhook). La regla de auto-approve excluye cualquier cambio de variables de entorno o secretos, aunque el spec los pedía. No toca `src/lib/auth.ts`, `src/proxy.ts`, el schema, las migraciones ni las dependencias. Tampoco borra datos.
- Scope: los 11 archivos del diff están dentro de Target Files (1122+/9-). Checks: lint, typecheck, test (396) y build pasan, y build también pasa sin variables de MP. AC-1 a AC-6 y AC-8 tienen evidencia. AC-7 (smoke en sandbox) quedó **pendiente** porque no hay credenciales; el spec dice que no bloquea, y los pasos están en `build.md`.
- Mirar antes de mergear:
  - **Supuestos de MP sin validar:** el body de `/authorized_payments/{id}` (`payment.id`) y el campo del preapproval en `/v1/payments/{id}` (`metadata.preapproval_id` / `point_of_interaction.transaction_data.subscription_id`). Si son incorrectos, los cobros quedan `"ignored"` y no se extiende `planExpiresAt`. No hay riesgo de cobro doble ni de cruce de tenants, pero sí de que pagos reales no se acrediten. Conviene correr el smoke (AC-7) antes de activar el billing en producción.
  - El webhook es público y su única defensa es la firma `x-signature`. Sin secreto responde 503, y con firma inválida, 401, sin tocar ni la DB ni MP. Revisé `src/lib/mercadopago-signature.ts`: usa `timingSafeEqual`, chequea el largo y nunca lanza.
  - El cambio cross-tenant en `src/server/billing.ts` (`MpPaymentConflictError` en la transacción y en el fallback P2002) es correcto, y el mensaje del error no lleva ids ni monto.
  - Nits de seguridad, no bloqueantes:
    - `type` no está cubierto por la firma. El impacto es nulo porque el recurso se vuelve a consultar a MP.
    - No se compara `transaction_amount` con `monthlyAmount`.
    - Un `transaction_amount` NaN da 500 y MP reintenta en loop. Sugerencia: devolver `"ignored"` con un log.
- Al configurar producción, `MP_WEBHOOK_SECRET` tiene que ser la clave de Webhooks de producción, no la de prueba, y `APP_BASE_URL` va sin barra final.
