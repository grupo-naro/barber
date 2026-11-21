// Armado puro de datos de la landing pública: link de WhatsApp con mensaje y horarios semanales.
// Sin Prisma ni Next, para poder testearlo con Vitest.

/**
 * Link de WhatsApp con un mensaje precargado (`?text=`, codificado). `null` si la barbería no
 * tiene WhatsApp. `baseUrl` es el `https://wa.me/<dígitos>` que arma `getPublicLanding`.
 */
export function whatsappMessageUrl(baseUrl: string | null | undefined, shopName: string): string | null {
  if (!baseUrl) return null;
  const text = `Hola ${shopName}! Quería consultar por un turno.`;
  return `${baseUrl}?text=${encodeURIComponent(text)}`;
}

export type OpeningHoursRow = {
  weekday: number;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
};

export type WeeklyHoursDay = {
  weekday: number;
  /** "Lunes" … "Domingo". */
  label: string;
  /** "09:00 – 20:00" o "Cerrado". */
  hours: string;
  closed: boolean;
  isToday: boolean;
};

const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Lunes → domingo (0 = domingo). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Horarios de la semana de lunes a domingo. Un día sin fila, marcado `closed` o con horas
 * vacías/ inválidas se muestra como "Cerrado". `todayWeekday` (0 = domingo) marca el día de hoy;
 * tiene que salir de `weekdayOf(businessDate(now, timeZone))`, nunca de `getDay()` local.
 */
export function weeklyHours(rows: readonly OpeningHoursRow[], todayWeekday: number): WeeklyHoursDay[] {
  const byWeekday = new Map(rows.map((r) => [r.weekday, r]));
  return WEEK_ORDER.map((weekday) => {
    const row = byWeekday.get(weekday);
    const open =
      row && !row.closed && row.opensAt && row.closesAt && TIME_RE.test(row.opensAt) && TIME_RE.test(row.closesAt);
    return {
      weekday,
      label: WEEKDAY_LABELS[weekday],
      hours: open ? `${row.opensAt} – ${row.closesAt}` : "Cerrado",
      closed: !open,
      isToday: weekday === todayWeekday,
    };
  });
}

/** `true` si la barbería cargó al menos un día abierto. */
export function hasOpeningHours(days: readonly WeeklyHoursDay[]): boolean {
  return days.some((d) => !d.closed);
}

/** Iniciales (máx. 2) para el monograma cuando no hay logo. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
