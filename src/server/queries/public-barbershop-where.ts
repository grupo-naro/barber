// Filtro de visibilidad pública de una barbería (landing, reservas, 404 del proxy). Sin dependencias de Next.
//
// - `status = SUSPENDED` (suspensión manual) le gana a todo: no se publica aunque el cobro esté al día.
// - Cobro desactivado (`EXEMPT`): se publica como siempre.
// - Cobro activado: se publica si pagó alguna vez (`planExpiresAt` no null). `BLOCKED` SIGUE publicada y
//   recibiendo reservas (el bloqueo es solo del panel); `AWAITING_FIRST_PAYMENT` no se publica.
// Es la versión en SQL de `isPubliclyVisible(billingState(...))` de `src/lib/billing.ts`.
import type { Prisma } from "@/generated/prisma/client";

export const publicBarbershopWhere: Prisma.BarbershopWhereInput = {
  status: "ACTIVE",
  OR: [{ billingEnabled: false }, { planExpiresAt: { not: null } }],
};
