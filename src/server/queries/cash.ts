// Cierre de caja diario: lectura del día (vista previa o cierre guardado) y la lógica del cierre.
// Código de servidor: el `barbershopId` y el `userId` los pasa el llamador y SIEMPRE salen de la
// sesión del servidor (`requireRole("OWNER")`), nunca del cliente. Sin dependencias de Next (ni de
// `server-only`) porque también lo usa `scripts/cash-smoke.ts`.
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  centsToDecimal,
  decimalToCents,
  summarizeDay,
  type PaymentMethodValue,
  type PayoutSchemeValue,
} from "@/lib/payouts";
import { isValidDate } from "@/lib/slots";
import { businessDate } from "@/lib/time";

/** Montos como string decimal con 2 decimales ("12000.00", "-3000.00"): nunca float. */
export type CashTotals = Record<PaymentMethodValue, string> & { total: string };

export type CashBarberRow = {
  barberId: string;
  name: string;
  scheme: PayoutSchemeValue;
  schemeValue: string;
  gross: string;
  barberAmount: string;
  shopAmount: string;
};

export type CashDay = {
  date: string;
  totals: CashTotals;
  barbers: CashBarberRow[];
  barberTotal: string;
  shopTotal: string;
  recordCount: number;
} & (
  | { status: "open" }
  | {
      status: "closed";
      closedByName: string;
      closedAt: Date;
      notes: string | null;
      /** Registros del día que quedaron afuera del cierre (creados mientras se cerraba). */
      openAfterClose: number;
    }
);

/** Columna `@db.Date` para un día "YYYY-MM-DD". */
export function dateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

const barberSelect = { id: true, name: true, payoutScheme: true, payoutValue: true } as const;

/**
 * Datos de `/dashboard/cash` para un día. Si la caja de ese día ya se cerró, devuelve el snapshot guardado
 * (los cambios posteriores en los acuerdos no lo afectan). Si no, la vista previa calculada sobre los
 * registros abiertos del día con el acuerdo vigente de cada barbero.
 */
export async function getCashDay(barbershopId: string, date: string): Promise<CashDay> {
  const businessDate = dateColumn(date);

  const close = await db.cashRegisterClose.findUnique({
    where: { barbershopId_businessDate: { barbershopId, businessDate } },
    include: {
      closedBy: { select: { name: true } },
      payouts: { include: { barber: { select: { name: true } } } },
      _count: { select: { records: true } },
    },
  });

  if (close) {
    const openAfterClose = await db.serviceRecord.count({
      where: { barbershopId, businessDate, cashCloseId: null },
    });
    const barbers = close.payouts
      .map((p) => ({
        barberId: p.barberId,
        name: p.barber.name,
        scheme: p.scheme,
        schemeValue: centsToDecimal(decimalToCents(p.schemeValue)),
        gross: centsToDecimal(decimalToCents(p.grossAmount)),
        barberAmount: centsToDecimal(decimalToCents(p.barberAmount)),
        shopAmount: centsToDecimal(decimalToCents(p.shopAmount)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "es") || a.barberId.localeCompare(b.barberId));
    const sum = (key: "barberAmount" | "shopAmount") =>
      centsToDecimal(close.payouts.reduce((acc, p) => acc + decimalToCents(p[key]), BigInt(0)));
    const money = (value: { toString(): string }) => centsToDecimal(decimalToCents(value));

    return {
      date,
      status: "closed",
      totals: {
        CASH: money(close.totalCash),
        TRANSFER: money(close.totalTransfer),
        CARD: money(close.totalCard),
        OTHER: money(close.totalOther),
        total: money(close.total),
      },
      barbers,
      barberTotal: sum("barberAmount"),
      shopTotal: sum("shopAmount"),
      recordCount: close._count.records,
      closedByName: close.closedBy.name,
      closedAt: close.closedAt,
      notes: close.notes,
      openAfterClose,
    };
  }

  const records = await db.serviceRecord.findMany({
    where: { barbershopId, businessDate, cashCloseId: null },
    select: { barberId: true, paymentMethod: true, total: true },
  });
  const barberIds = [...new Set(records.map((r) => r.barberId))];
  const barbers =
    barberIds.length === 0
      ? []
      : await db.user.findMany({ where: { barbershopId, id: { in: barberIds } }, select: barberSelect });
  const day = summarizeDay(records, barbers);

  return {
    date,
    status: "open",
    totals: {
      CASH: centsToDecimal(day.byMethod.CASH),
      TRANSFER: centsToDecimal(day.byMethod.TRANSFER),
      CARD: centsToDecimal(day.byMethod.CARD),
      OTHER: centsToDecimal(day.byMethod.OTHER),
      total: centsToDecimal(day.totalCents),
    },
    barbers: day.barbers.map((b) => ({
      barberId: b.barberId,
      name: b.name,
      scheme: b.scheme,
      schemeValue: b.value,
      gross: centsToDecimal(b.grossCents),
      barberAmount: centsToDecimal(b.barberCents),
      shopAmount: centsToDecimal(b.shopCents),
    })),
    barberTotal: centsToDecimal(day.barberTotalCents),
    shopTotal: centsToDecimal(day.shopTotalCents),
    recordCount: day.recordCount,
  };
}

export type CloseCashInput = {
  barbershopId: string;
  /** Quién cierra (de la sesión). */
  userId: string;
  /** Día a cerrar, "YYYY-MM-DD". */
  date: string;
  notes: string | null;
  /** Timezone de la barbería (de la sesión), para no permitir cerrar días futuros. */
  timeZone: string;
  now?: Date;
};

export type CloseCashResult =
  | { ok: true; closeId: string; recordCount: number; total: string }
  | { ok: false; error: string };

export const CLOSE_ERRORS = {
  invalidDate: "Elegí una fecha válida.",
  futureDate: "No podés cerrar la caja de un día que todavía no llegó.",
  alreadyClosed: "Ya se cerró la caja de ese día",
  empty: "No hay cortes para cerrar ese día",
  changed: "Los cortes del día cambiaron mientras cerrabas la caja. Reintentá.",
} as const;

class CloseCashError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Cierra la caja de un día en UNA transacción: recalcula desde la DB los registros abiertos del día
 * y los acuerdos vigentes, crea el `CashRegisterClose` con sus `BarberPayout` (snapshot del acuerdo) y
 * vincula los registros. Si algo no cuadra, hace rollback y no deja nada a medias.
 */
export async function closeCashDay(input: CloseCashInput): Promise<CloseCashResult> {
  const { barbershopId, userId, date, notes, timeZone } = input;
  if (!isValidDate(date)) return { ok: false, error: CLOSE_ERRORS.invalidDate };
  if (date > businessDate(input.now ?? new Date(), timeZone)) return { ok: false, error: CLOSE_ERRORS.futureDate };
  const day = dateColumn(date);

  try {
    return await db.$transaction(async (tx) => {
      // Serializa los cierres del mismo día de la misma barbería: el lock se libera al terminar la
      // transacción, así que quien espera ve el cierre ya committeado y responde "Ya se cerró…"
      // (en vez de leer 0 registros abiertos y decir "No hay cortes…").
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cash-close:${barbershopId}:${date}`}, 0))`;

      const existing = await tx.cashRegisterClose.findUnique({
        where: { barbershopId_businessDate: { barbershopId, businessDate: day } },
        select: { id: true },
      });
      if (existing) throw new CloseCashError(CLOSE_ERRORS.alreadyClosed);

      const records = await tx.serviceRecord.findMany({
        where: { barbershopId, businessDate: day, cashCloseId: null },
        select: { id: true, barberId: true, paymentMethod: true, total: true },
      });
      if (records.length === 0) throw new CloseCashError(CLOSE_ERRORS.empty);

      const barberIds = [...new Set(records.map((r) => r.barberId))];
      const barbers = await tx.user.findMany({
        where: { barbershopId, id: { in: barberIds } },
        select: barberSelect,
      });
      if (barbers.length !== barberIds.length) throw new CloseCashError(CLOSE_ERRORS.changed);

      let summary: ReturnType<typeof summarizeDay>;
      try {
        summary = summarizeDay(records, barbers);
      } catch {
        // Datos inconsistentes (barbero o monto inesperado): mensaje amable en vez de un 500.
        throw new CloseCashError(CLOSE_ERRORS.changed);
      }
      const close = await tx.cashRegisterClose.create({
        data: {
          barbershopId,
          businessDate: day,
          totalCash: centsToDecimal(summary.byMethod.CASH),
          totalTransfer: centsToDecimal(summary.byMethod.TRANSFER),
          totalCard: centsToDecimal(summary.byMethod.CARD),
          totalOther: centsToDecimal(summary.byMethod.OTHER),
          total: centsToDecimal(summary.totalCents),
          closedById: userId,
          notes,
          payouts: {
            create: summary.barbers.map((b) => ({
              barberId: b.barberId,
              scheme: b.scheme,
              schemeValue: b.value,
              grossAmount: centsToDecimal(b.grossCents),
              barberAmount: centsToDecimal(b.barberCents),
              shopAmount: centsToDecimal(b.shopCents),
            })),
          },
        },
        select: { id: true },
      });

      const ids = records.map((r) => r.id);
      const { count } = await tx.serviceRecord.updateMany({
        where: { id: { in: ids }, cashCloseId: null, barbershopId },
        data: { cashCloseId: close.id },
      });
      if (count !== ids.length) throw new CloseCashError(CLOSE_ERRORS.changed);

      return { ok: true as const, closeId: close.id, recordCount: ids.length, total: centsToDecimal(summary.totalCents) };
    });
  } catch (error) {
    if (error instanceof CloseCashError) return { ok: false, error: error.message };
    if (isUniqueViolation(error)) return { ok: false, error: CLOSE_ERRORS.alreadyClosed };
    throw error;
  }
}
