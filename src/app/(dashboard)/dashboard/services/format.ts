const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

/** Precio decimal ("12000.00") en ARS: "$ 12.000,00". Se formatea el string, sin pasar por float. */
export function formatPrice(price: string): string {
  return ars.format(price as Intl.StringNumericLiteral);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Clases compartidas para controles nativos (select, textarea) con objetivo táctil ≥ 44px. */
export const nativeControlClass =
  "min-h-11 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:opacity-50 md:text-sm dark:bg-input/30";
