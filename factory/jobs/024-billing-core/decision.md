ESCALATE

**Motivo:** Cambia el schema y agrega una migración (`billing_core`). Las 4 reviews dan PASS, pero ese tipo de cambio necesita que lo apruebe un humano.

## Notas
- **Por qué escala:** toca `prisma/schema.prisma` y agrega `prisma/migrations/20261122100000_billing_core/migration.sql`. Las dos cosas están en el scope y el spec las pide, pero los cambios de schema y las migraciones nunca se aprueban solos. Lo demás está en orden: 4/4 PASS en la ronda 1, AC-1 a AC-6 con evidencia en `build.md`, lint, typecheck, test (361) y build en verde, y los 6 archivos del diff dentro de los Target Files. No toca auth, proxy, dependencias, env ni datos.
- **Migración:** es solo aditiva, sin DROP ni backfill. `billingEnabled BOOLEAN NOT NULL DEFAULT false`, así que las barberías existentes quedan en EXEMPT, que es el anti-objetivo del spec. Las columnas nuevas de `Barbershop` admiten null. Hay dos índices únicos nuevos: `SubscriptionPayment.mpPaymentId` y `Barbershop.mpPreapprovalId`. Este último no puede fallar sobre datos existentes porque la columna es nueva y está toda en null. El FK `onDelete: Cascade` sigue el patrón de las otras tablas hijas.
- **Cómo se generó:** el SQL salió de `prisma migrate diff` en lugar de `migrate dev --name`, porque `migrate dev` se negaba a correr en modo no interactivo. El timestamp `20261122100000` se eligió a mano para que quede después de `brand_colors`. Conviene confirmar que ese orden no choca con otra migración en vuelo en otra rama.
- **Tests con DB:** `src/server/billing.test.ts` corre contra la DB real con `import "dotenv/config"`. Sin DB, `pnpm test` falla. Hay que confirmar que eso sirve para el CI o el entorno donde corren los checks en `main`.
- **Para el job 026 (webhook):** según la review de seguridad, la idempotencia busca `mpPaymentId` sin filtrar por `barbershopId`. Si un id llega con otra barbería, devuelve `created: false` sin avisar. Hoy no se puede explotar porque no hay ningún llamador, pero conviene resolverlo antes del webhook.
- Para mergear: `/factory approve`. Para pedir cambios: `/factory rework`.
