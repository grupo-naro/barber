"use server";

// Wrapper fino sobre `createPublicBooking` para el formulario público. Sin sesión: la
// reserva es pública. La validación, el tenant (por slug) y la anti-doble-reserva
// viven en `createPublicBooking`.
import { refresh } from "next/cache";
import { createPublicBooking } from "@/server/booking";

/** Lo que vuelve al navegador: sin `appointmentId` (no hay flujo que lo use). */
export type BookingFormState =
  | { ok: true; startsAt: string }
  | { ok: false; error: string }
  | null;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function bookAppointment(
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const result = await createPublicBooking(field(formData, "slug"), {
    name: field(formData, "name"),
    phone: field(formData, "phone"),
    serviceId: field(formData, "serviceId"),
    startsAt: field(formData, "startsAt"),
  });
  if (!result.ok) return result;
  refresh();
  return { ok: true, startsAt: result.startsAt };
}
