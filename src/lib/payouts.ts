// Lógica pura del cierre de caja y la liquidación de barberos.
// Todo en centavos enteros (`bigint`), nunca con `number` flotante. Sin Prisma ni Next: la usan
// la vista previa de `/dashboard/cash`, el cierre (dentro de la transacción) y los tests.

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "CARD", "OTHER"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export type PayoutSchemeValue = "PERCENTAGE" | "FIXED_RENT" | "NONE";

/** String decimal ("12000.50", "-3000") o `Decimal` de Prisma. */
export type DecimalLike = string | { toString(): string };

const DECIMAL_PATTERN = /^-?\d{1,13}(\.\d{1,2})?$/;
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

/** Decimal con signo y hasta 2 decimales → centavos. Lanza si no es un monto válido. */
export function decimalToCents(value: DecimalLike): bigint {
  const text = value.toString().trim();
  if (!DECIMAL_PATTERN.test(text)) throw new Error(`Monto inválido: ${text}`);
  const negative = text.startsWith("-");
  const [int, frac = ""] = text.replace(/^-/, "").split(".");
  const cents = BigInt(int + frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** Centavos → string decimal con 2 decimales ("-3000.00"). */
export function centsToDecimal(cents: bigint): string {
  const negative = cents < ZERO;
  const abs = negative ? -cents : cents;
  const frac = (abs % HUNDRED).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${abs / HUNDRED}.${frac}`;
}

/** División entera al más cercano, mitades alejándose de cero (half-up para valores ≥ 0). */
function divRoundHalfUp(numerator: bigint, divisor: bigint): bigint {
  const negative = numerator < ZERO;
  const abs = negative ? -numerator : numerator;
  const q = (BigInt(2) * abs + divisor) / (BigInt(2) * divisor);
  return negative ? -q : q;
}

export type PayoutInput = {
  scheme: PayoutSchemeValue;
  /** `payoutValue` del barbero: porcentaje (`PERCENTAGE`) o alquiler diario de silla (`FIXED_RENT`). */
  value: DecimalLike;
  grossCents: bigint;
};

export type PayoutResult = { barberCents: bigint; shopCents: bigint };

/**
 * Liquidación de un barbero para un día. Siempre `barberCents + shopCents === grossCents`.
 * - `PERCENTAGE`: el barbero se lleva `round(bruto × valor / 100)` (half-up a centavos); el resto, la barbería.
 * - `FIXED_RENT`: la barbería se queda el alquiler (`valor`) y el barbero el resto (puede ser negativo:
 *   le debe a la barbería).
 * - `NONE`: todo para la barbería.
 */
export function computePayout({ scheme, value, grossCents }: PayoutInput): PayoutResult {
  const valueCents = decimalToCents(value);
  let barberCents: bigint;
  switch (scheme) {
    case "PERCENTAGE":
      // `valueCents` es el porcentaje × 100 → dividir por 100 × 100.
      barberCents = divRoundHalfUp(grossCents * valueCents, HUNDRED * HUNDRED);
      break;
    case "FIXED_RENT":
      barberCents = grossCents - valueCents;
      break;
    case "NONE":
      barberCents = ZERO;
      break;
    default: {
      const unknown: never = scheme;
      throw new Error(`Esquema de liquidación desconocido: ${String(unknown)}`);
    }
  }
  return { barberCents, shopCents: grossCents - barberCents };
}

export type DayRecord = { barberId: string; paymentMethod: PaymentMethodValue; total: DecimalLike };
export type DayBarber = { id: string; name: string; payoutScheme: PayoutSchemeValue; payoutValue: DecimalLike };

export type BarberSummary = {
  barberId: string;
  name: string;
  scheme: PayoutSchemeValue;
  /** `payoutValue` normalizado a 2 decimales ("50.00"). */
  value: string;
  grossCents: bigint;
  barberCents: bigint;
  shopCents: bigint;
  recordCount: number;
};

export type DaySummary = {
  byMethod: Record<PaymentMethodValue, bigint>;
  totalCents: bigint;
  barbers: BarberSummary[];
  barberTotalCents: bigint;
  shopTotalCents: bigint;
  recordCount: number;
};

/**
 * Resumen del día: totales por medio de pago, total general y liquidación de cada barbero con
 * registros (ordenados por nombre). Los barberos sin registros no aparecen. Lanza si un registro
 * es de un barbero que no está en `barbers`.
 */
export function summarizeDay(records: readonly DayRecord[], barbers: readonly DayBarber[]): DaySummary {
  const byMethod: Record<PaymentMethodValue, bigint> = { CASH: ZERO, TRANSFER: ZERO, CARD: ZERO, OTHER: ZERO };
  const barberById = new Map(barbers.map((b) => [b.id, b]));
  const gross = new Map<string, { barber: DayBarber; cents: bigint; count: number }>();
  let totalCents = ZERO;

  for (const record of records) {
    if (!(record.paymentMethod in byMethod)) throw new Error(`Medio de pago desconocido: ${record.paymentMethod}`);
    const barber = barberById.get(record.barberId);
    if (!barber) throw new Error(`Barbero desconocido: ${record.barberId}`);
    const cents = decimalToCents(record.total);
    byMethod[record.paymentMethod] += cents;
    totalCents += cents;
    const acc = gross.get(record.barberId) ?? { barber, cents: ZERO, count: 0 };
    gross.set(record.barberId, { barber, cents: acc.cents + cents, count: acc.count + 1 });
  }

  const summaries: BarberSummary[] = [...gross.entries()].map(([barberId, { barber, cents, count }]) => {
    const { barberCents, shopCents } = computePayout({
      scheme: barber.payoutScheme,
      value: barber.payoutValue,
      grossCents: cents,
    });
    return {
      barberId,
      name: barber.name,
      scheme: barber.payoutScheme,
      value: centsToDecimal(decimalToCents(barber.payoutValue)),
      grossCents: cents,
      barberCents,
      shopCents,
      recordCount: count,
    };
  });
  summaries.sort((a, b) => a.name.localeCompare(b.name, "es") || a.barberId.localeCompare(b.barberId));

  return {
    byMethod,
    totalCents,
    barbers: summaries,
    barberTotalCents: summaries.reduce((sum, b) => sum + b.barberCents, ZERO),
    shopTotalCents: summaries.reduce((sum, b) => sum + b.shopCents, ZERO),
    recordCount: records.length,
  };
}
