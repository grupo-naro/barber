import { DEFAULT_TIMEZONE } from "@/lib/time";

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  timeZone: DEFAULT_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("es-AR", {
  timeZone: DEFAULT_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "dd/mm/aaaa" en la timezone de la plataforma (o "—"). */
export function formatDate(date: Date | null, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!date) return "—";
  return timeZone === DEFAULT_TIMEZONE
    ? dateFormat.format(date)
    : new Intl.DateTimeFormat("es-AR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** "dd/mm/aaaa hh:mm" en la timezone de la plataforma (o "Sin actividad"). */
export function formatDateTime(date: Date | null): string {
  return date ? dateTimeFormat.format(date) : "Sin actividad";
}
