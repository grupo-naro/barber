// Lógica pura del cobro de la suscripción de cada barbería. Sin Prisma ni Next: la usan el servidor,
// el layout del panel, las queries públicas, los scripts y los tests.
//
// El estado de cobro se deriva en cada request de `billingEnabled` y `planExpiresAt` ("pagado hasta",
// `paidUntil` acá): no hay cron. `status = SUSPENDED` no se mira acá; le gana a cualquier estado de cobro.
import { planExpiresAtFromDate } from "@/lib/platform-admin";
import { businessDate } from "@/lib/time";

/** Margen después de `paidUntil` antes de bloquear el panel: 10 días de reintentos de MP + 2. */
export const BILLING_GRACE_DAYS = 12;

/** Un cobro de MP con un pago manual en estos días previos (y el período vigente) es un posible cobro doble. */
export const DUPLICATE_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BillingState = "EXEMPT" | "AWAITING_FIRST_PAYMENT" | "PAID" | "GRACE" | "BLOCKED";

/**
 * Estado de cobro:
 * - `EXEMPT`: cobro desactivado (barberías existentes al desplegar), sin importar `paidUntil`.
 * - `AWAITING_FIRST_PAYMENT`: cobro activado y nunca pagó.
 * - `PAID`: `now <= paidUntil`.
 * - `GRACE`: `paidUntil < now <= paidUntil + BILLING_GRACE_DAYS`.
 * - `BLOCKED`: pasó el margen.
 */
export function billingState(input: { billingEnabled: boolean; paidUntil: Date | null }, now: Date): BillingState {
  if (!input.billingEnabled) return "EXEMPT";
  if (input.paidUntil === null) return "AWAITING_FIRST_PAYMENT";
  const paidUntil = input.paidUntil.getTime();
  const t = now.getTime();
  if (t <= paidUntil) return "PAID";
  if (t <= paidUntil + BILLING_GRACE_DAYS * DAY_MS) return "GRACE";
  return "BLOCKED";
}

/** El panel se corta solo sin primer pago o con el margen vencido. */
export function canUsePanel(state: BillingState): boolean {
  return state !== "AWAITING_FIRST_PAYMENT" && state !== "BLOCKED";
}

/** La landing y las reservas se cortan solo sin primer pago (`BLOCKED` sigue publicada). */
export function isPubliclyVisible(state: BillingState): boolean {
  return state !== "AWAITING_FIRST_PAYMENT";
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "YYYY-MM-DD" + `months` meses calendario; si el día no existe en el mes destino, el último día del mes. */
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Nuevo "pagado hasta" tras un pago: día de negocio de `max(paidUntil, paidAt)` + `months` meses calendario,
 * como último milisegundo de ese día en la timezone de la barbería.
 */
export function extendPaidUntil(paidUntil: Date | null, paidAt: Date, months: number, timeZone: string): Date {
  if (!Number.isInteger(months) || months < 1) throw new Error(`Meses inválidos: ${months}`);
  const base = paidUntil !== null && paidUntil.getTime() > paidAt.getTime() ? paidUntil : paidAt;
  return planExpiresAtFromDate(addMonths(businessDate(base, timeZone), months), timeZone);
}

/**
 * Posible cobro doble: un cobro de MP que llega con el período todavía vigente (`paidUntilBefore > paidAt`)
 * y con un pago manual en los `DUPLICATE_WINDOW_DAYS` días anteriores a `paidAt`. Un pago manual nunca lo es.
 */
export function isSuspectedDuplicate(input: {
  source: "MERCADOPAGO" | "MANUAL";
  paidUntilBefore: Date | null;
  paidAt: Date;
  lastManualPaidAt: Date | null;
}): boolean {
  if (input.source !== "MERCADOPAGO") return false;
  if (input.paidUntilBefore === null || input.paidUntilBefore.getTime() <= input.paidAt.getTime()) return false;
  if (input.lastManualPaidAt === null) return false;
  const elapsed = input.paidAt.getTime() - input.lastManualPaidAt.getTime();
  return elapsed >= 0 && elapsed <= DUPLICATE_WINDOW_DAYS * DAY_MS;
}
