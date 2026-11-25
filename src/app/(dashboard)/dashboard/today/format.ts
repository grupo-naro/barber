const longDate = new Intl.DateTimeFormat("es-AR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

const shortDate = new Intl.DateTimeFormat("es-AR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** "2026-11-24" → "Martes 24 de noviembre" (fecha de calendario, sin corrimiento de zona). */
export function formatLongDate(date: string): string {
  const text = longDate.format(new Date(`${date}T12:00:00.000Z`)).replace(",", "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "2026-11-20" → "20/11/2026". */
export function formatShortDate(date: string): string {
  return shortDate.format(new Date(`${date}T12:00:00.000Z`));
}

/** Iniciales para el avatar: "Nahuel García" → "NG", "Martín" → "M". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return picked.map((word) => ([...word][0] ?? "").toUpperCase()).join("");
}

/** Controles nativos (select, textarea) con objetivo táctil ≥ 44px y tokens de tema. */
export const nativeControlClass =
  "min-h-11 w-full rounded-lg border border-input bg-card px-2.5 py-2 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:opacity-50 md:text-sm dark:bg-input/30";

/** Acción principal de Hoy y de sus hojas (va sobre `Button`). */
export const ctaClass = "h-14 w-full rounded-[10px] text-lg font-semibold whitespace-normal";

/** Chip seleccionable (label que envuelve un checkbox/radio oculto), ≥ 44px. */
export const chipClass =
  "inline-flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-full border border-input bg-background px-4 py-2 text-sm font-medium transition-colors has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-50";
