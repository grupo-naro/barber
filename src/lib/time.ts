export const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

/** Día de negocio ("YYYY-MM-DD") de un instante, en la timezone de la barbería. */
export function businessDate(instant: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Hora local "HH:mm" de un instante, en la timezone de la barbería. */
export function localTime(instant: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}
