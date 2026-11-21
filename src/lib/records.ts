// Lógica pura del "Cuaderno Digital" (registros de cortes del día). Sin Prisma ni Next:
// la usan las Server Actions, las lecturas del panel, los componentes de cliente y scripts.
import { centsToPrice, priceToCents } from "@/lib/pricing";
import { addDays, isValidDate, zonedTimeToUtc } from "@/lib/slots";
import { DEFAULT_TIMEZONE } from "@/lib/time";

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "CARD", "OTHER"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodValue, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

export const APPOINTMENT_STATUS_LABELS = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
  NO_SHOW: "No vino",
} as const;

/** Estados desde los que un turno se puede completar, marcar como "no vino" o cancelar. */
export const OPEN_APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED"] as const;

/** Largo máximo de las notas técnicas del cliente. */
export const CUSTOMER_NOTES_MAX = 1000;

/** Intentos de alta ante una violación de unicidad (`P2002`) del número diario. */
export const MAX_CREATE_ATTEMPTS = 5;

/** Límites UTC `[inicio, fin)` de un día de negocio "YYYY-MM-DD" en la timezone de la barbería. */
export function dayBoundsUtc(date: string, timeZone: string = DEFAULT_TIMEZONE): [Date, Date] {
  if (!isValidDate(date)) throw new Error(`Fecha inválida: ${date}`);
  return [zonedTimeToUtc(date, "00:00", timeZone), zonedTimeToUtc(addDays(date, 1), "00:00", timeZone)];
}

/** Día de negocio "YYYY-MM-DD" → valor para una columna `@db.Date` (medianoche UTC). */
export function businessDateToDb(date: string): Date {
  if (!isValidDate(date)) throw new Error(`Fecha inválida: ${date}`);
  return new Date(`${date}T00:00:00.000Z`);
}

/** Siguiente número correlativo del día a partir del máximo actual (`null` si no hay registros). */
export function nextDailyNumber(currentMax: number | null | undefined): number {
  return (currentMax ?? 0) + 1;
}

/** Suma exacta (en centavos) de precios decimales ("100.10", Decimal de Prisma…). Devuelve "300.30". */
export function sumPrices(prices: readonly (string | { toString(): string })[]): string {
  let total = BigInt(0);
  for (const price of prices) total += priceToCents(price);
  return centsToPrice(total);
}

/** Normaliza un teléfono a sólo dígitos. Devuelve `null` si no tiene entre 8 y 15 dígitos. */
export function normalizePhone(raw: string): string | null {
  if (raw.length > 40) return null;
  const digits = raw.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/** Notas técnicas: recorta espacios; vacío → `null`. No valida el largo (eso lo hace el schema). */
export function normalizeNotes(raw: string): string | null {
  const text = raw.trim();
  return text === "" ? null : text;
}

/** `true` si el error es una violación de unicidad de Prisma (`P2002`). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export const ONLY_OWN_COMPLETION = "Sólo podés completar turnos a tu nombre.";

export type CompletingActor = { userId: string; role: "OWNER" | "BARBER" };

/**
 * Quién atendió un turno al completarlo. BARBER → siempre él (pedir otro id es un error);
 * OWNER → el barbero pedido o, si viene vacío, él mismo. No valida que el usuario exista ni
 * sea de la barbería: eso se verifica contra la DB con el `barbershopId` de la sesión.
 */
export function resolveCompletingBarber(
  actor: CompletingActor,
  requestedBarberId: string | null | undefined,
): { ok: true; barberId: string } | { ok: false; error: string } {
  const requested = requestedBarberId?.trim() || null;
  if (actor.role === "BARBER") {
    return requested === null || requested === actor.userId
      ? { ok: true, barberId: actor.userId }
      : { ok: false, error: ONLY_OWN_COMPLETION };
  }
  return { ok: true, barberId: requested ?? actor.userId };
}
