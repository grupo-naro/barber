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
  /** "09:00 – 20:00", "10:00 – 14:00 · 17:00 – 21:00" (horario cortado) o "Cerrado". */
  hours: string;
  closed: boolean;
  isToday: boolean;
};

const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Lunes → domingo (0 = domingo). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Franja válida de una fila: no `closed`, horas "HH:mm" y apertura < cierre. */
function isValidRange(row: OpeningHoursRow): row is OpeningHoursRow & { opensAt: string; closesAt: string } {
  return (
    !row.closed &&
    typeof row.opensAt === "string" &&
    typeof row.closesAt === "string" &&
    TIME_RE.test(row.opensAt) &&
    TIME_RE.test(row.closesAt) &&
    row.opensAt < row.closesAt
  );
}

/**
 * Horarios de la semana de lunes a domingo. Hay una fila por franja: las franjas válidas de un día
 * se ordenan por apertura y se unen con " · " (ej. "10:00 – 14:00 · 17:00 – 21:00"). Un día sin
 * franjas válidas (sin filas, `closed` o con horas vacías/inválidas) se muestra como "Cerrado".
 * `todayWeekday` (0 = domingo) marca el día de hoy; tiene que salir de
 * `weekdayOf(businessDate(now, timeZone))`, nunca de `getDay()` local.
 */
export function weeklyHours(rows: readonly OpeningHoursRow[], todayWeekday: number): WeeklyHoursDay[] {
  return WEEK_ORDER.map((weekday) => {
    const ranges = rows
      .filter((r) => r.weekday === weekday)
      .filter(isValidRange)
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt) || a.closesAt.localeCompare(b.closesAt));
    const open = ranges.length > 0;
    return {
      weekday,
      label: WEEKDAY_LABELS[weekday],
      hours: open ? ranges.map((r) => `${r.opensAt} – ${r.closesAt}`).join(" · ") : "Cerrado",
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
