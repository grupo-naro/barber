// Motor puro de turnos libres: sin Prisma ni Next, para poder testearlo y reusarlo
// desde la página pública, la Server Action y scripts.
import { DEFAULT_TIMEZONE } from "@/lib/time";

/** Duración fija de cada turno: la grilla pública es por hora en punto. */
export const SLOT_MINUTES = 60;

/** Horario de un día de semana ("HH:mm" locales). `null`/`undefined` = sin horario cargado. */
export type DayHours = {
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
} | null | undefined;

export type HourlySlotsInput = {
  hours: DayHours;
  /** Día de negocio "YYYY-MM-DD" en la timezone de la barbería. */
  date: string;
  timeZone?: string;
  now: Date;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Valida "YYYY-MM-DD" (fecha de calendario real). */
export function isValidDate(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/** Valida "HH:mm" (00:00–23:59). */
export function isValidTime(time: string): boolean {
  return TIME_RE.test(time);
}

function parseTime(time: string): number | null {
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Día de semana de una fecha de calendario (0 = domingo … 6 = sábado). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Suma días de calendario a "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Cuántos días de negocio hacia adelante (además de hoy) se pueden reservar. */
export const BOOKING_DAYS_AHEAD = 14;

/** Días reservables: hoy + los próximos `BOOKING_DAYS_AHEAD` días de negocio. */
export function bookableDates(today: string, daysAhead: number = BOOKING_DAYS_AHEAD): string[] {
  return Array.from({ length: daysAhead + 1 }, (_, i) => addDays(today, i));
}

/** Offset (ms) de la timezone en un instante: hora local leída como UTC − instante. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - (instant.getTime() - instant.getUTCMilliseconds());
}

/**
 * Convierte fecha + hora locales de la timezone a un instante UTC usando `Intl`
 * (sin hardcodear offsets; contempla horario de verano si la zona lo tiene).
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let result = naive - tzOffsetMs(new Date(naive), timeZone);
  // Segunda pasada por si el offset cambia entre la hora "ingenua" y la real (DST).
  const corrected = naive - tzOffsetMs(new Date(result), timeZone);
  if (corrected !== result) result = corrected;
  return new Date(result);
}

/**
 * Horarios por hora en punto (instantes UTC, ordenados) de un día de negocio.
 * Se ofrece `H:00` local si `[H:00, H:00 + 60 min)` entra completo en el horario y
 * empieza estrictamente después de `now`. No depende de turnos existentes ni de la
 * duración del servicio: varios turnos pueden compartir la misma hora.
 */
export function computeHourlySlots(input: HourlySlotsInput): Date[] {
  const { hours, date, now } = input;
  const timeZone = input.timeZone ?? DEFAULT_TIMEZONE;

  if (!hours || hours.closed || !hours.opensAt || !hours.closesAt) return [];
  if (!isValidDate(date)) return [];

  const openMin = parseTime(hours.opensAt);
  const closeMin = parseTime(hours.closesAt);
  if (openMin === null || closeMin === null || closeMin <= openMin) return [];

  const slots: Date[] = [];
  for (let h = Math.ceil(openMin / 60); h * 60 + SLOT_MINUTES <= closeMin; h++) {
    const slot = zonedTimeToUtc(date, `${String(h).padStart(2, "0")}:00`, timeZone);
    if (slot.getTime() > now.getTime()) slots.push(slot);
  }
  return slots;
}
