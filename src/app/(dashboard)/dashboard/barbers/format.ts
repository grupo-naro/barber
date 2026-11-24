import type { PayoutSchemeValue } from "@/lib/barbershop-settings";
import { formatPrice } from "@/lib/money";

const pct = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** Regla vigente en texto. Solo el porcentaje pasa por `Number`, para mostrarlo. */
export function describePayout(scheme: PayoutSchemeValue, value: string): string {
  if (scheme === "PERCENTAGE") return `${pct.format(Number(value))} % de lo facturado`;
  if (scheme === "FIXED_RENT") return `Alquiler fijo de ${formatPrice(value)}`;
  return "Sin liquidación";
}
