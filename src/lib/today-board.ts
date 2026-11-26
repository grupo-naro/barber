// Reglas puras de la agenda de Hoy. Sin React ni Prisma: las usan el tablero de cliente y sus hojas.
import { formatPrice } from "@/lib/money";
import { OPEN_APPOINTMENT_STATUSES } from "@/lib/records";
import { SLOT_MINUTES } from "@/lib/slots";
import type { TodayAppointment } from "@/server/queries/records";

/** Posición de la línea de ahora: antes del primer turno cuya hora (inicio + 1 h) no terminó. */
export function nowLineIndex(startsAt: readonly Date[], now: Date): number {
  const index = startsAt.findIndex((start) => start.getTime() + SLOT_MINUTES * 60_000 > now.getTime());
  return index === -1 ? startsAt.length : index;
}

export type AppointmentTag = { label: string; tone: "accent" | "muted" | "neutral" };

/** `true` si el turno todavía se puede completar, marcar como "no vino" o cancelar. */
export function isOpenAppointment(status: TodayAppointment["status"]): boolean {
  return (OPEN_APPOINTMENT_STATUSES as readonly string[]).includes(status);
}

/**
 * Etiqueta de una fila: el resultado si terminó; si no, quién atiende o "Sin asignar". `null` en los turnos propios
 * del barbero: repetiría su nombre en cada fila.
 */
export function appointmentTag(
  a: Pick<TodayAppointment, "status" | "barber">,
  viewer: { role: "OWNER" | "BARBER"; userId: string },
): AppointmentTag | null {
  if (a.status === "COMPLETED") return { label: "Listo", tone: "muted" };
  if (a.status === "NO_SHOW") return { label: "No vino", tone: "muted" };
  if (a.status === "CANCELLED") return { label: "Cancelado", tone: "muted" };
  if (!a.barber) return { label: "Sin asignar", tone: "accent" };
  if (viewer.role === "BARBER" && a.barber.id === viewer.userId) return null;
  return { label: a.barber.name, tone: "neutral" };
}

/** Resumen del día en una frase. `total` es un decimal en string ("36000.00"). */
export function daySummary(role: "OWNER" | "BARBER", count: number, total: string): string {
  if (count === 0) {
    return role === "OWNER" ? "La barbería todavía no tiene cortes hoy" : "Todavía no hiciste cortes hoy";
  }
  const cuts = `${count} ${count === 1 ? "corte" : "cortes"} por ${formatPrice(total)}`;
  return role === "OWNER" ? `La barbería lleva ${cuts}` : `Hiciste ${cuts}`;
}

export type OpenTarget = { state: "open" | "done"; appointment: TodayAppointment } | { state: "gone" };

/** Qué pasó con el turno que está abierto en la hoja, según la última lista del servidor. */
export function findOpenTarget(items: readonly TodayAppointment[], id: string): OpenTarget {
  const appointment = items.find((item) => item.id === id);
  if (!appointment) return { state: "gone" };
  return { state: isOpenAppointment(appointment.status) ? "open" : "done", appointment };
}
