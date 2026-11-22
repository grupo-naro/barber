// Lógica pura de la gestión del cobro desde el panel de la PLATAFORMA: esquemas Zod de las server actions de
// `src/server/actions/admin-billing.ts`, etiquetas y helpers de fechas/montos. Sin Prisma ni Next.
import { z } from "zod";
import type { BillingState } from "@/lib/billing";
import { barbershopIdField, emailField } from "@/lib/platform-admin";
import { isValidDate, zonedTimeToUtc } from "@/lib/slots";
import { businessDate, DEFAULT_TIMEZONE } from "@/lib/time";

// ---------------------------------------------------------------------------------------------------------------
// Campos

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;

/** Monto en ARS como string decimal: mayor a 0 y con hasta 2 decimales. Nunca se convierte a `number`. */
export const amountField = z
  .string({ error: "Ingresá un monto" })
  .trim()
  .min(1, "Ingresá un monto")
  .refine((value) => AMOUNT_RE.test(value), "Ingresá un monto válido (hasta 2 decimales, sin puntos de miles)")
  .refine((value) => !AMOUNT_RE.test(value) || /[1-9]/.test(value), "El monto tiene que ser mayor a 0");

/** Meses que cubre un pago manual: entero entre 1 y 12; vacío o ausente = 1. */
export const monthsField = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return 1;
    if (typeof value === "string") return value.trim() === "" ? 1 : Number(value.trim());
    return value;
  },
  z
    .number({ error: "Ingresá entre 1 y 12 meses" })
    .int("Ingresá un número entero de meses")
    .min(1, "Ingresá entre 1 y 12 meses")
    .max(12, "Ingresá entre 1 y 12 meses"),
);

/** Fecha "YYYY-MM-DD" de calendario real. */
export const dateField = z
  .string({ error: "Ingresá una fecha válida" })
  .trim()
  .refine((value) => isValidDate(value), "Ingresá una fecha válida");

/** Texto opcional recortado: vacío → `null`. */
function optionalText(max: number, message: string) {
  return z
    .string()
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed === "" ? null : trimmed;
    })
    .refine((value) => value === null || value.length <= max, message);
}

/** CBU/CVU opcional: si viene, 22 dígitos. Se aceptan espacios al copiarlo (se quitan). */
export const cbuField = z
  .string()
  .optional()
  .nullable()
  .transform((value) => {
    const compact = (value ?? "").replace(/\s+/g, "");
    return compact === "" ? null : compact;
  })
  .refine((value) => value === null || /^\d{22}$/.test(value), "El CBU/CVU tiene que tener 22 dígitos");

/** WhatsApp opcional: dígitos, espacios, `+` y `-` (al menos 6 dígitos). */
export const whatsappField = optionalText(30, "Puede tener hasta 30 caracteres").refine(
  (value) => value === null || (/^[\d\s+-]+$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6),
  "Usá solo números, espacios, + y -",
);

// ---------------------------------------------------------------------------------------------------------------
// Esquemas de las acciones

export const generateLinkSchema = z.object({
  id: barbershopIdField,
  amount: amountField,
  payerEmail: emailField,
});

export const changeAmountSchema = z.object({
  id: barbershopIdField,
  amount: amountField,
});

export const setBillingEnabledSchema = z.object({
  id: barbershopIdField,
  enabled: z.enum(["0", "1"], { error: "Valor inválido" }).transform((value) => value === "1"),
  confirm: z
    .string()
    .optional()
    .nullable()
    .transform((value) => value === "1"),
});

export const manualPaymentSchema = z.object({
  id: barbershopIdField,
  amount: amountField,
  paidAt: dateField,
  months: monthsField,
  note: optionalText(500, "La nota puede tener hasta 500 caracteres"),
});

export const markDuplicateReviewedSchema = z.object({
  id: barbershopIdField,
  paymentId: z.string().trim().min(1, "Pago inválido").max(100, "Pago inválido"),
});

export const platformSettingsSchema = z.object({
  transferAlias: optionalText(60, "Puede tener hasta 60 caracteres"),
  transferCbu: cbuField,
  transferHolder: optionalText(100, "Puede tener hasta 100 caracteres"),
  contactWhatsapp: whatsappField,
});
export type PlatformSettingsInput = z.output<typeof platformSettingsSchema>;

// ---------------------------------------------------------------------------------------------------------------
// Helpers

/** Hay una suscripción de MP que puede cobrar (o autorizarse): existe y no está cancelada. */
export function hasLivePreapproval<T extends { mpPreapprovalId: string | null; mpStatus: string | null }>(
  shop: T,
): shop is T & { mpPreapprovalId: string } {
  return shop.mpPreapprovalId !== null && shop.mpStatus !== "cancelled";
}

/** `true` si la fecha "YYYY-MM-DD" es posterior al día de negocio de `now` en la timezone. */
export function isFutureBusinessDate(date: string, now: Date, timeZone: string = DEFAULT_TIMEZONE): boolean {
  return date > businessDate(now, timeZone);
}

/** Instante guardado como `paidAt` de un pago manual: el mediodía de ese día en la timezone de la barbería. */
export function manualPaidAtInstant(date: string, timeZone: string = DEFAULT_TIMEZONE): Date {
  return zonedTimeToUtc(date, "12:00", timeZone);
}

const arsFormat = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

/** Monto decimal (string, de un `Decimal`) en ARS. Solo para mostrar. */
export function formatARS(amount: string | null): string {
  if (amount === null) return "—";
  return arsFormat.format(Number(amount));
}

export const BILLING_STATE_LABELS: Record<BillingState, string> = {
  EXEMPT: "Sin cobro",
  AWAITING_FIRST_PAYMENT: "Esperando primer pago",
  PAID: "Al día",
  GRACE: "En margen",
  BLOCKED: "Bloqueada por falta de pago",
};

export function mpStatusLabel(status: string | null): string {
  if (status === null) return "Sin suscripción";
  switch (status) {
    case "pending":
      return "Pendiente (no autorizada)";
    case "authorized":
      return "Autorizada (cobrando)";
    case "paused":
      return "Pausada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

export const PAYMENT_SOURCE_LABELS: Record<"MERCADOPAGO" | "MANUAL", string> = {
  MERCADOPAGO: "Mercado Pago",
  MANUAL: "Transferencia (manual)",
};
