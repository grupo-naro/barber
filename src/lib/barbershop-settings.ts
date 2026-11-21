// Validación pura de la configuración de la barbería (perfil, horarios, liquidaciones).
// Sin Prisma ni Next: la usan las Server Actions y sus tests.
import { z } from "zod";
import { isValidTime } from "@/lib/slots";

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------

/** String opcional: trim, vacío → `null`. */
function optionalText(max: number, message: string) {
  return z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((v) => (v ? v : null));
}

const WHATSAPP_RE = /^\+?\d{8,15}$/;

/** Normaliza un WhatsApp a dígitos con `+` inicial opcional. Devuelve `null` si queda vacío. */
export function normalizeWhatsapp(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  return compact === "" ? null : compact;
}

/** `true` si es una URL absoluta `http:` o `https:`. */
export function isHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// El logo ya no se edita acá: se sube como imagen desde la card "Página pública"
// (`src/server/actions/landing.ts`), así guardar el perfil no pisa el logo subido.
export const profileSchema = z.object({
  name: z
    .string({ error: "Ingresá el nombre de la barbería" })
    .trim()
    .min(1, "Ingresá el nombre de la barbería")
    .max(80, "El nombre puede tener hasta 80 caracteres"),
  description: optionalText(500, "La descripción puede tener hasta 500 caracteres"),
  address: optionalText(200, "La dirección puede tener hasta 200 caracteres"),
  whatsapp: z
    .string()
    .nullish()
    .transform((v) => (v ? normalizeWhatsapp(v) : null))
    .refine((v) => v === null || WHATSAPP_RE.test(v), {
      message: "Ingresá un WhatsApp válido: entre 8 y 15 dígitos, con código de país (ej. +54 9 11 1234-5678)",
    }),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileData = z.output<typeof profileSchema>;

// ---------------------------------------------------------------------------
// Horarios
// ---------------------------------------------------------------------------

export const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

/** Orden de visualización: lunes primero, domingo al final. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type DayHoursData = {
  weekday: number;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

const dayHoursSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    closed: z.boolean(),
    opensAt: z.string().nullish(),
    closesAt: z.string().nullish(),
  })
  .superRefine((day, ctx) => {
    if (day.closed) return;
    const opensOk = typeof day.opensAt === "string" && isValidTime(day.opensAt);
    const closesOk = typeof day.closesAt === "string" && isValidTime(day.closesAt);
    if (!opensOk) ctx.addIssue({ code: "custom", path: ["opensAt"], message: "Hora de apertura inválida" });
    if (!closesOk) ctx.addIssue({ code: "custom", path: ["closesAt"], message: "Hora de cierre inválida" });
    // "HH:mm" con ceros a la izquierda: la comparación de strings respeta el orden horario.
    if (opensOk && closesOk && day.opensAt! >= day.closesAt!) {
      ctx.addIssue({ code: "custom", path: ["closesAt"], message: "El cierre tiene que ser después de la apertura" });
    }
  })
  .transform(
    (day): DayHoursData =>
      day.closed
        ? { weekday: day.weekday, closed: true, opensAt: null, closesAt: null }
        : { weekday: day.weekday, closed: false, opensAt: day.opensAt!, closesAt: day.closesAt! },
  );

export const openingHoursSchema = z
  .array(dayHoursSchema)
  .length(7, "Tienen que ser exactamente los 7 días de la semana")
  .superRefine((days, ctx) => {
    if (new Set(days.map((d) => d.weekday)).size !== days.length) {
      ctx.addIssue({ code: "custom", message: "Hay días repetidos" });
    }
  })
  .transform((days) => [...days].sort((a, b) => a.weekday - b.weekday));

export type OpeningHoursInput = z.input<typeof openingHoursSchema>;

/**
 * Agrupa los errores de horarios por weekday (`"0"`…`"6"`), con un mensaje por día.
 * Los errores generales (cantidad de días, repetidos) van en `form`.
 */
export function openingHoursErrors(error: z.ZodError, input: readonly { weekday?: unknown }[]) {
  const byDay: Record<string, string> = {};
  let form: string | undefined;
  for (const issue of error.issues) {
    const index = issue.path[0];
    if (typeof index === "number") {
      const weekday = input[index]?.weekday;
      const key = String(weekday ?? index);
      byDay[key] ??= issue.message;
    } else {
      form ??= issue.message;
    }
  }
  return { byDay, form };
}

// ---------------------------------------------------------------------------
// Liquidación por barbero
// ---------------------------------------------------------------------------

export const PAYOUT_SCHEMES = ["PERCENTAGE", "FIXED_RENT", "NONE"] as const;
export type PayoutSchemeValue = (typeof PAYOUT_SCHEMES)[number];

export const PAYOUT_SCHEME_LABELS: Record<PayoutSchemeValue, string> = {
  PERCENTAGE: "Porcentaje",
  FIXED_RENT: "Alquiler fijo",
  NONE: "Sin liquidación",
};

// Decimal no negativo con hasta 2 decimales y como mucho 10 dígitos enteros (Decimal(12,2)).
const DECIMAL_RE = /^(\d{1,10})(?:\.(\d{1,2}))?$/;

/**
 * Normaliza un monto escrito por el usuario a string decimal canónico ("120000", "40.5"),
 * sin pasar nunca por `number`. Acepta coma decimal. Devuelve `null` si no es válido.
 */
export function normalizeDecimal(raw: string): string | null {
  const m = DECIMAL_RE.exec(raw.trim().replace(",", "."));
  if (!m) return null;
  const int = m[1].replace(/^0+(?=\d)/, "");
  const frac = (m[2] ?? "").replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/** Compara un decimal canónico no negativo contra 100 sin usar float. */
function isAtMost100(value: string): boolean {
  // `value` viene de normalizeDecimal: sin ceros a la izquierda ni ceros finales en los decimales.
  const [int, frac = ""] = value.split(".");
  if (int.length < 3) return true;
  return int === "100" && frac === "";
}

/** Campos de liquidación (sin transformar). Los reutiliza el schema de edición de barbero (`src/lib/barbers.ts`). */
export const payoutFields = {
  payoutScheme: z.enum(PAYOUT_SCHEMES, { error: "Elegí un esquema de liquidación" }),
  payoutValue: z.string().nullish(),
};

/**
 * Reglas de la liquidación: NONE → "0"; si no, decimal canónico (y ≤ 100 para PERCENTAGE).
 * Agrega el issue en `payoutValue` y devuelve `null` si no es válido.
 */
export function resolvePayoutValue(
  input: { payoutScheme: PayoutSchemeValue; payoutValue?: string | null },
  ctx: z.RefinementCtx,
): string | null {
  if (input.payoutScheme === "NONE") return "0";
  const value = normalizeDecimal(input.payoutValue ?? "");
  if (value === null) {
    ctx.addIssue({
      code: "custom",
      path: ["payoutValue"],
      message: "Ingresá un número mayor o igual a 0, con hasta 2 decimales",
    });
    return null;
  }
  if (input.payoutScheme === "PERCENTAGE" && !isAtMost100(value)) {
    ctx.addIssue({ code: "custom", path: ["payoutValue"], message: "El porcentaje tiene que estar entre 0 y 100" });
    return null;
  }
  return value;
}

export const payoutSchema = z
  .object({
    userId: z.string().trim().min(1, "Usuario inválido").max(100),
    ...payoutFields,
  })
  .transform((input, ctx) => {
    const value = resolvePayoutValue(input, ctx);
    if (value === null) return z.NEVER;
    return { userId: input.userId, payoutScheme: input.payoutScheme, payoutValue: value };
  });

export type PayoutInput = z.input<typeof payoutSchema>;
export type PayoutData = z.output<typeof payoutSchema>;

// ---------------------------------------------------------------------------
// Estado común de las actions
// ---------------------------------------------------------------------------

export type ActionResult =
  | { ok: true; message?: string; /** Valores normalizados que guardó el servidor, para reflejarlos en el form. */ values?: Record<string, string> }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Primer mensaje por campo (path[0]) de un ZodError. */
export function firstFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "form";
    out[key] ??= issue.message;
  }
  return out;
}
