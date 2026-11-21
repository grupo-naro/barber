// Lógica pura de precios: actualización masiva (% o monto fijo) con redondeo.
// Todo se calcula en centavos enteros (`bigint`), nunca con `number` flotante. Sin Prisma ni Next:
// la usan tanto la vista previa en el navegador como la Server Action que escribe en la DB.

export const PRICE_MODES = ["percent", "fixed"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];

export const ROUNDINGS = ["none", "500", "1000"] as const;
export type Rounding = (typeof ROUNDINGS)[number];

/** Precio máximo que entra en la columna `Decimal(12, 2)`. */
export const MAX_PRICE_CENTS = BigInt(999_999_999_999);

/** Precio no negativo con hasta 2 decimales: "12000", "12000.5", "12000,50". */
export const PRICE_PATTERN = /^\d{1,10}([.,]\d{1,2})?$/;

/** Valor de ajuste: porcentaje (hasta 4 decimales) o monto fijo (hasta 2 decimales), con signo. */
const PERCENT_PATTERN = /^[+-]?\d{1,4}([.,]\d{1,4})?$/;
const FIXED_PATTERN = /^[+-]?\d{1,10}([.,]\d{1,2})?$/;

/** Límites del ajuste masivo: no se puede bajar más del 100 % ni subir más del 1000 %. */
export const MIN_PERCENT = -100;
export const MAX_PERCENT = 1000;

type DecimalLike = string | { toString(): string };

/** Parsea un decimal ya validado ("-12.5") a entero escalado por 10^scale. */
function toScaled(text: string, scale: number): bigint {
  const normalized = text.replace(",", ".");
  const negative = normalized.startsWith("-");
  const unsigned = normalized.replace(/^[+-]/, "");
  const [int, frac = ""] = unsigned.split(".");
  const scaled = BigInt(int + frac.padEnd(scale, "0"));
  return negative ? -scaled : scaled;
}

/** Precio ("12000.50", Decimal de Prisma, etc.) → centavos. Lanza si no es un precio válido. */
export function priceToCents(price: DecimalLike): bigint {
  const text = price.toString().trim();
  if (!PRICE_PATTERN.test(text)) throw new Error(`Precio inválido: ${text}`);
  return toScaled(text, 2);
}

/** Centavos → string decimal con 2 decimales ("13200.00"). */
export function centsToPrice(cents: bigint): string {
  const negative = cents < BigInt(0);
  const abs = negative ? -cents : cents;
  const int = abs / BigInt(100);
  const frac = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${int}.${frac}`;
}

/** `true` si `value` es un precio válido (≥ 0, máx. 2 decimales, entra en la columna). */
export function isValidPrice(value: string): boolean {
  const text = value.trim();
  return PRICE_PATTERN.test(text) && toScaled(text, 2) <= MAX_PRICE_CENTS;
}

/** Normaliza un precio validado a "12000.50". */
export function normalizePrice(value: string): string {
  return centsToPrice(priceToCents(value));
}

/**
 * Valida el valor del ajuste según el modo. Devuelve el mensaje de error (en español) o `null` si es válido.
 * Porcentaje: entre -100 y 1000, hasta 4 decimales. Monto fijo: hasta 2 decimales.
 */
export function adjustmentError(mode: PriceMode, value: string | number): string | null {
  const text = String(value).trim();
  if (text === "") return "Ingresá un valor.";
  if (mode === "percent") {
    if (!PERCENT_PATTERN.test(text)) return "Ingresá un porcentaje válido (ej. 10 o -5,5).";
    const scaled = toScaled(text, 4);
    if (scaled < BigInt(MIN_PERCENT) * BigInt(10_000) || scaled > BigInt(MAX_PERCENT) * BigInt(10_000)) {
      return `El porcentaje tiene que estar entre ${MIN_PERCENT} % y ${MAX_PERCENT} %.`;
    }
    return null;
  }
  if (!FIXED_PATTERN.test(text)) return "Ingresá un monto válido (ej. 1500 o -500), con hasta 2 decimales.";
  const scaled = toScaled(text, 2);
  if (scaled > MAX_PRICE_CENTS || -scaled > MAX_PRICE_CENTS) return "El monto es demasiado grande.";
  return null;
}

/** División entera redondeando al más cercano, mitades hacia arriba (numerador ≥ 0, divisor > 0). */
function divRoundHalfUp(numerator: bigint, divisor: bigint): bigint {
  return (BigInt(2) * numerator + divisor) / (BigInt(2) * divisor);
}

const ROUNDING_STEP_CENTS: Record<Rounding, bigint | null> = {
  none: null,
  "500": BigInt(50_000),
  "1000": BigInt(100_000),
};

/**
 * Nuevo precio a partir del actual.
 * - `percent`: `actual × (1 + valor/100)`, redondeado al centavo (mitades hacia arriba).
 * - `fixed`: `actual + valor`.
 * Después se aplica piso en 0 y el redondeo al múltiplo de $500 / $1000 más cercano (mitades hacia arriba).
 * Devuelve un string con 2 decimales ("13200.00"). Lanza si el precio o el valor son inválidos.
 */
export function calculateNewPrice(
  current: DecimalLike,
  mode: PriceMode,
  value: string | number,
  rounding: Rounding,
): string {
  return centsToPrice(calculateNewPriceCents(current, mode, value, rounding));
}

/**
 * Igual que `calculateNewPrice` pero devuelve centavos. Puede superar `MAX_PRICE_CENTS`:
 * quien escribe en la DB tiene que chequearlo (`exceedsMaxPrice`).
 */
export function calculateNewPriceCents(
  current: DecimalLike,
  mode: PriceMode,
  value: string | number,
  rounding: Rounding,
): bigint {
  const error = adjustmentError(mode, value);
  if (error) throw new Error(error);
  const cents = priceToCents(current);
  const text = String(value).trim();

  let next: bigint;
  if (mode === "percent") {
    // valor con 4 decimales: factor = (1_000_000 + P) / 1_000_000
    const base = BigInt(1_000_000);
    const numerator = cents * (base + toScaled(text, 4));
    next = numerator <= BigInt(0) ? BigInt(0) : divRoundHalfUp(numerator, base);
  } else {
    next = cents + toScaled(text, 2);
  }
  if (next < BigInt(0)) next = BigInt(0);

  const step = ROUNDING_STEP_CENTS[rounding];
  if (step) next = divRoundHalfUp(next, step) * step;

  return next;
}

/** `true` si el precio (en centavos) no entra en la columna `Decimal(12, 2)`. */
export function exceedsMaxPrice(cents: bigint): boolean {
  return cents > MAX_PRICE_CENTS;
}
