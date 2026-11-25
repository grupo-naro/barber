// Único formateador de precios del panel. La landing y `/admin` tienen los suyos (siempre con centavos).

const options = { style: "currency", currency: "ARS" } as const;
const withoutCents = new Intl.NumberFormat("es-AR", { ...options, maximumFractionDigits: 0 });
const withCents = new Intl.NumberFormat("es-AR", options);

/** Sin parte decimal, o con una que es toda ceros ("15000", "15000.00"). */
const WHOLE_RE = /^-?\d+(\.0*)?$/;

/**
 * Precio decimal en ARS: "15000.00" → "$15.000", "1500.5" → "$1.500,50". Sin centavos cuando son cero.
 * Se formatea el string (`StringNumericLiteral`), sin pasar por float.
 */
export function formatPrice(price: string): string {
  const format = WHOLE_RE.test(price) ? withoutCents : withCents;
  // `Intl` separa el signo `$` del número con un espacio duro.
  return format.format(price as Intl.StringNumericLiteral).replace(/\s/g, "");
}
