// Registro de pagos de la suscripción (Mercado Pago o manuales). Es el único camino que extiende
// `Barbershop.planExpiresAt` ("pagado hasta") cuando el cobro está activado.
// Sin dependencias de Next para poder llamarlo desde el webhook, el admin, scripts y tests.
// `barbershopId` llega de un llamador de confianza (webhook de MP ya validado o sesión de admin), nunca de
// la sesión de una barbería: no se expone como server action.
//
// Idempotencia: `SubscriptionPayment.mpPaymentId` es `@unique`. Dentro de la transacción se bloquea la fila
// de la barbería (`FOR UPDATE`) para serializar los pagos de una misma barbería, se chequea si el pago ya
// existe y se inserta + extiende el período en la misma transacción. Si dos llamadas compiten igual y la
// inserción choca con `P2002`, la transacción entera se revierte (no queda el período extendido) y se
// devuelve `{ created: false }`.
//
// Multi-tenant: `mpPaymentId` es único en toda la tabla. Si el pago ya está registrado en **otra** barbería no
// se devuelve `created: false` en silencio: se lanza `MpPaymentConflictError` (anomalía que el llamador loguea).
import { Prisma } from "@/generated/prisma/client";
import { extendPaidUntil, isSuspectedDuplicate } from "@/lib/billing";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/records";

export type RecordPaymentInput = {
  barbershopId: string;
  source: "MERCADOPAGO" | "MANUAL";
  /** Monto en ARS como string decimal ("15000" o "15000.50"); nunca un `number` flotante. */
  amount: string;
  paidAt: Date;
  months: number;
  /** Id del **pago** de MP (no de la cuota). Obligatorio para `MERCADOPAGO`. */
  mpPaymentId?: string;
  note?: string;
  createdByAdminId?: string;
};

export type RecordPaymentResult = { created: boolean; paidUntil: Date };

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * El `mpPaymentId` ya está registrado en otra barbería. El `message` es genérico a propósito: no lleva
 * `barbershopId` ni montos, para que no se filtre si algún llamador lo muestra.
 */
export class MpPaymentConflictError extends Error {
  constructor() {
    super("El pago de Mercado Pago ya está registrado en otra barbería");
    this.name = "MpPaymentConflictError";
  }
}

class AlreadyRecorded extends Error {
  constructor(readonly paidUntil: Date) {
    super("Pago ya registrado");
  }
}

function validate(input: RecordPaymentInput) {
  if (!AMOUNT_RE.test(input.amount) || new Prisma.Decimal(input.amount).lte(0)) {
    throw new Error(`Monto inválido: ${input.amount}`);
  }
  if (!Number.isInteger(input.months) || input.months < 1) throw new Error(`Meses inválidos: ${input.months}`);
  if (Number.isNaN(input.paidAt.getTime())) throw new Error("Fecha de pago inválida");
  if (input.source === "MERCADOPAGO" && !input.mpPaymentId) throw new Error("Falta mpPaymentId en un pago de MP");
}

/**
 * "Pagado hasta" actual de la DB para responder a un pago repetido (fallback por `P2002`). Si el pago que
 * chocó es de otra barbería, lanza `MpPaymentConflictError` en lugar de devolver datos de otro tenant.
 */
async function currentPaidUntil(barbershopId: string, mpPaymentId: string): Promise<Date> {
  const existing = await db.subscriptionPayment.findUnique({
    where: { mpPaymentId },
    select: { barbershopId: true, coversUntil: true },
  });
  if (existing && existing.barbershopId !== barbershopId) throw new MpPaymentConflictError();
  const shop = await db.barbershop.findUnique({ where: { id: barbershopId }, select: { planExpiresAt: true } });
  if (shop?.planExpiresAt) return shop.planExpiresAt;
  // Sin "pagado hasta" (editado a mano): lo que cubrió el pago ya registrado (de esta misma barbería).
  if (existing) return existing.coversUntil;
  throw new Error(`Barbería sin "pagado hasta": ${barbershopId}`);
}

/**
 * Registra un pago aprobado y extiende el período: `paidUntil = max(paidUntil, paidAt) + months` (día de negocio).
 * Si el `mpPaymentId` ya estaba registrado en esta barbería devuelve `{ created: false, paidUntil: <el actual> }`
 * sin extender; si está registrado en otra barbería lanza `MpPaymentConflictError` sin tocar nada.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  validate(input);
  const mpPaymentId = input.mpPaymentId || undefined;

  try {
    return await db.$transaction(
      async (tx) => {
        // Serializa los pagos de la misma barbería (evita perder una extensión entre dos pagos distintos).
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Barbershop" WHERE "id" = ${input.barbershopId} FOR UPDATE`;
        if (locked.length === 0) throw new Error(`Barbería inexistente: ${input.barbershopId}`);

        const shop = await tx.barbershop.findUniqueOrThrow({
          where: { id: input.barbershopId },
          select: { planExpiresAt: true, timezone: true },
        });

        if (mpPaymentId) {
          const existing = await tx.subscriptionPayment.findUnique({
            where: { mpPaymentId },
            select: { barbershopId: true, coversUntil: true },
          });
          if (existing && existing.barbershopId !== input.barbershopId) throw new MpPaymentConflictError();
          if (existing) throw new AlreadyRecorded(shop.planExpiresAt ?? existing.coversUntil);
        }

        const lastManual = await tx.subscriptionPayment.findFirst({
          where: { barbershopId: input.barbershopId, source: "MANUAL" },
          orderBy: { paidAt: "desc" },
          select: { paidAt: true },
        });

        const suspectedDuplicate = isSuspectedDuplicate({
          source: input.source,
          paidUntilBefore: shop.planExpiresAt,
          paidAt: input.paidAt,
          lastManualPaidAt: lastManual?.paidAt ?? null,
        });
        const paidUntil = extendPaidUntil(shop.planExpiresAt, input.paidAt, input.months, shop.timezone);

        await tx.subscriptionPayment.create({
          data: {
            barbershopId: input.barbershopId,
            source: input.source,
            amount: new Prisma.Decimal(input.amount),
            paidAt: input.paidAt,
            coversUntil: paidUntil,
            mpPaymentId: mpPaymentId ?? null,
            note: input.note ?? null,
            createdByAdminId: input.createdByAdminId ?? null,
            suspectedDuplicate,
          },
        });
        await tx.barbershop.update({ where: { id: input.barbershopId }, data: { planExpiresAt: paidUntil } });

        return { created: true, paidUntil };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  } catch (error) {
    if (error instanceof AlreadyRecorded) return { created: false, paidUntil: error.paidUntil };
    if (mpPaymentId && isUniqueViolation(error)) {
      return { created: false, paidUntil: await currentPaidUntil(input.barbershopId, mpPaymentId) };
    }
    throw error;
  }
}
