import type { PayoutSchemeValue } from "@/lib/barbershop-settings";

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const pct = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** Regla vigente en texto. Formatear para mostrar es lo único que pasa por `Number`. */
export function describePayout(scheme: PayoutSchemeValue, value: string): string {
  if (scheme === "PERCENTAGE") return `${pct.format(Number(value))} % de lo facturado`;
  if (scheme === "FIXED_RENT") return `Alquiler fijo de ${ars.format(Number(value))}`;
  return "Sin liquidación";
}
