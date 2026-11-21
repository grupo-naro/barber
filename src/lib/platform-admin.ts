// Lógica pura del panel de administración de la plataforma. Sin Prisma ni Next: la usan las actions, las
// queries, los scripts y los tests.
import { z } from "zod";
import { addDays, isValidDate, zonedTimeToUtc } from "@/lib/slots";
import { businessDate, DEFAULT_TIMEZONE } from "@/lib/time";
import { validateSlug } from "@/lib/slugs";

export const PLANS = ["FREE", "BASIC", "PRO"] as const;
export type PlanValue = (typeof PLANS)[number];
export const PLAN_LABELS: Record<PlanValue, string> = { FREE: "Gratis", BASIC: "Básico", PRO: "Pro" };

export const BARBERSHOP_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type BarbershopStatusValue = (typeof BARBERSHOP_STATUSES)[number];
export const STATUS_LABELS: Record<BarbershopStatusValue, string> = { ACTIVE: "Activa", SUSPENDED: "Suspendida" };

/** Mensaje del login (y de `/login?suspended=1`) cuando la barbería del usuario está suspendida. */
export const SUSPENDED_MESSAGE = "Tu barbería está suspendida. Contactá al administrador.";

/** Errores genéricos: no revelan si el slug o el email existen (ni en qué barbería). */
export const SLUG_UNAVAILABLE = "Ese slug no está disponible.";
export const EMAIL_UNAVAILABLE = "Ese email no está disponible.";

// ---------------------------------------------------------------------------------------------------------------
// Schemas

const nameField = (label: string) =>
  z
    .string({ error: `Ingresá ${label}` })
    .trim()
    .min(1, `Ingresá ${label}`)
    .max(80, "Puede tener hasta 80 caracteres");

export const slugField = z
  .string({ error: "Ingresá un slug" })
  .trim()
  .toLowerCase()
  .superRefine((slug, ctx) => {
    const result = validateSlug(slug);
    if (!result.ok) ctx.addIssue({ code: "custom", message: result.error });
  });

export const emailField = z
  .string({ error: "Ingresá un email válido" })
  .trim()
  .toLowerCase()
  .max(254, "Ingresá un email válido")
  .pipe(z.email({ error: "Ingresá un email válido" }));

export const barbershopIdField = z.string().trim().min(1, "Barbería inválida").max(100, "Barbería inválida");

/** Fecha opcional "YYYY-MM-DD" (vacío = sin vencimiento → `null`). */
const optionalDateField = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || isValidDate(value), "Ingresá una fecha válida");

export const createBarbershopSchema = z.object({
  name: nameField("el nombre de la barbería"),
  slug: slugField,
  ownerName: nameField("el nombre del dueño"),
  ownerEmail: emailField,
});
export type CreateBarbershopInput = z.output<typeof createBarbershopSchema>;

export const updateBarbershopSchema = z.object({
  id: barbershopIdField,
  name: nameField("el nombre de la barbería"),
  slug: slugField,
  ownerEmail: emailField,
  plan: z.enum(PLANS, { error: "Elegí un plan" }),
  planExpiresAt: optionalDateField,
});
export type UpdateBarbershopInput = z.output<typeof updateBarbershopSchema>;

export const setStatusSchema = z.object({
  id: barbershopIdField,
  status: z.enum(BARBERSHOP_STATUSES, { error: "Estado inválido" }),
});

export const barbershopRefSchema = z.object({ id: barbershopIdField });

export const adminLoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

/** Búsqueda del listado (`?q=`): texto acotado; vacío = sin filtro. */
export function normalizeSearch(q: unknown): string {
  return typeof q === "string" ? q.trim().slice(0, 80) : "";
}

// ---------------------------------------------------------------------------------------------------------------
// Plan

/** Vencimiento guardado para una fecha elegida: el último milisegundo de ese día en la timezone. */
export function planExpiresAtFromDate(date: string, timeZone: string = DEFAULT_TIMEZONE): Date {
  return new Date(zonedTimeToUtc(addDays(date, 1), "00:00", timeZone).getTime() - 1);
}

/** "dd/mm/aaaa" de un instante, en la timezone. */
export function formatDateAR(instant: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    instant,
  );
}

export const PLAN_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PlanBanner = { kind: "none" } | { kind: "expiring" | "expired"; date: string };

/**
 * Banner del plan para el dueño. `expired` si el vencimiento ya pasó (o es exactamente ahora), `expiring` si
 * faltan 7 días o menos (7 días exactos ya es `expiring`) y `none` si no hay vencimiento o falta más.
 */
export function planBanner(planExpiresAt: Date | null, now: Date, timeZone: string = DEFAULT_TIMEZONE): PlanBanner {
  if (!planExpiresAt) return { kind: "none" };
  const remaining = planExpiresAt.getTime() - now.getTime();
  if (remaining <= 0) return { kind: "expired", date: formatDateAR(planExpiresAt, timeZone) };
  if (remaining <= PLAN_WARNING_DAYS * DAY_MS) return { kind: "expiring", date: formatDateAR(planExpiresAt, timeZone) };
  return { kind: "none" };
}

export function planBannerMessage(banner: PlanBanner): string | null {
  if (banner.kind === "expiring") return `Tu plan vence el ${banner.date}.`;
  if (banner.kind === "expired") return `Tu plan venció el ${banner.date}, contactá al administrador.`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Métricas

export type MonthRange = {
  /** Primer instante del mes de negocio (00:00 local del día 1), en UTC. */
  start: Date;
  /** Primer instante del mes siguiente (exclusivo), en UTC. */
  end: Date;
  /** Día de negocio "YYYY-MM-01" del mes. */
  startDate: string;
  /** Día de negocio "YYYY-MM-01" del mes siguiente (exclusivo). */
  endDate: string;
};

/** Mes de negocio que contiene `now` en la timezone: rango semiabierto `[start, end)`. */
export function monthRange(now: Date, timeZone: string = DEFAULT_TIMEZONE): MonthRange {
  const [year, month] = businessDate(now, timeZone).split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return {
    start: zonedTimeToUtc(startDate, "00:00", timeZone),
    end: zonedTimeToUtc(endDate, "00:00", timeZone),
    startDate,
    endDate,
  };
}

/** La fecha más reciente entre las que no son null/undefined; `null` si no hay ninguna. */
export function lastActivity(...dates: (Date | null | undefined)[]): Date | null {
  let max: Date | null = null;
  for (const date of dates) {
    if (date && (max === null || date.getTime() > max.getTime())) max = date;
  }
  return max;
}

// ---------------------------------------------------------------------------------------------------------------
// Alta

/** Contraseña aleatoria del admin (24 bytes → 32 caracteres base64url). Se imprime una sola vez. */
export function generateAdminPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type DefaultOpeningHours = { weekday: number; opensAt: string | null; closesAt: string | null; closed: boolean };

/** Horario inicial de una barbería nueva: domingo cerrado, lunes a sábado de 10:00 a 20:00. */
export function defaultOpeningHours(): DefaultOpeningHours[] {
  return Array.from({ length: 7 }, (_, weekday) =>
    weekday === 0
      ? { weekday, opensAt: null, closesAt: null, closed: true }
      : { weekday, opensAt: "10:00", closesAt: "20:00", closed: false },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Invitaciones INVITE / RESET

export type InvitationKindValue = "INVITE" | "RESET";

export type InvitationCheck = {
  kind: InvitationKindValue;
  barbershopId: string;
  barbershop: { status: BarbershopStatusValue };
  user: { barbershopId: string; passwordHash: string | null; active: boolean };
};

/**
 * Reglas de tipo/usuario/barbería de una invitación (la vigencia y el uso los mira `isInvitationUsable`).
 * - INVITE: el usuario todavía no tiene contraseña (flujo del job 017, sin cambios).
 * - RESET: nuevo acceso del dueño generado por el admin; vale aunque ya tenga contraseña.
 * En los dos casos: usuario activo, de la misma barbería, y la barbería ACTIVE (suspendida → rechazo).
 */
export function invitationAllowsUser(invitation: InvitationCheck): boolean {
  if (invitation.barbershop.status !== "ACTIVE") return false;
  if (!invitation.user.active || invitation.user.barbershopId !== invitation.barbershopId) return false;
  return invitation.kind === "RESET" || invitation.user.passwordHash === null;
}
