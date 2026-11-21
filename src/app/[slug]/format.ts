import { zonedTimeToUtc } from "@/lib/slots";

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

/** "lun 23/11" para un día de negocio "YYYY-MM-DD". */
export function formatDayShort(date: string, timeZone: string): { weekday: string; day: string } {
  const noon = zonedTimeToUtc(date, "12:00", timeZone);
  const weekday = new Intl.DateTimeFormat("es-AR", { timeZone, weekday: "short" }).format(noon).replace(".", "");
  const day = new Intl.DateTimeFormat("es-AR", { timeZone, day: "numeric", month: "numeric" }).format(noon);
  return { weekday, day };
}

/** "lunes 23 de noviembre" para un día de negocio "YYYY-MM-DD". */
export function formatDayLong(date: string, timeZone: string): string {
  const noon = zonedTimeToUtc(date, "12:00", timeZone);
  return new Intl.DateTimeFormat("es-AR", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(noon);
}

export type Selection = { service?: string; date?: string; time?: string };

/** URL de la página con la selección del flujo en `searchParams`. */
export function bookingHref(slug: string, selection: Selection): string {
  const params = new URLSearchParams();
  for (const key of ["service", "date", "time"] as const) {
    const value = selection[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return `/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`;
}
