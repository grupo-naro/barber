// Reserva pública online. Sin dependencias de Next para poder llamarla desde scripts.
// Endpoint sin sesión: todo input se valida con Zod, el tenant sale del slug resuelto
// en el servidor y el servicio se verifica contra ese tenant. El barbero NO se elige al
// reservar: el turno queda sin asignar (`barberId = null`) y se asigna al completarlo.
//
// Los turnos son por hora en punto y no tienen cupo (varios pueden compartir la hora); la
// única protección contra el doble envío es por cliente: un mismo teléfono no puede tener
// dos turnos abiertos a la misma hora.
import { z } from "zod";
import { db } from "@/lib/db";
import { OPEN_APPOINTMENT_STATUSES } from "@/lib/records";
import { SLOT_MINUTES, bookableDates, computeHourlySlots } from "@/lib/slots";
import { businessDate } from "@/lib/time";
import { getDayHours, resolveBarbershop } from "@/server/queries/booking";

/** Sin `barberId`: si llega uno en el input, Zod lo descarta (objeto no estricto). */
export const bookingInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresá tu nombre (mínimo 2 caracteres).")
    .max(80, "El nombre puede tener hasta 80 caracteres."),
  phone: z
    .string()
    .max(40, "Ingresá un teléfono válido (8 a 15 dígitos).")
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{8,15}$/, "Ingresá un teléfono válido (8 a 15 dígitos).")),
  serviceId: z.string().trim().min(1, "Elegí un servicio.").max(64),
  startsAt: z.iso.datetime({ offset: true, error: "Elegí un horario válido." }),
});

export type PublicBookingInput = z.input<typeof bookingInputSchema>;

export type PublicBookingResult =
  | { ok: true; appointmentId: string; startsAt: string }
  | { ok: false; error: string };

const SLOT_UNAVAILABLE = "Ese horario no está disponible. Elegí otro, por favor.";
const ALREADY_BOOKED = "Ya tenés un turno reservado a esa hora.";

class BookingRejected extends Error {}

export async function createPublicBooking(
  slug: string,
  input: unknown,
  now: Date = new Date(),
): Promise<PublicBookingResult> {
  const parsed = bookingInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos de la reserva." };
  }
  const data = parsed.data;
  const startsAt = new Date(data.startsAt);

  const shop = await resolveBarbershop(slug);
  if (!shop) return { ok: false, error: "La barbería no existe." };

  // Servicio siempre verificado contra la barbería del slug.
  const service = await db.service.findFirst({
    where: { id: data.serviceId, barbershopId: shop.id, active: true, showOnline: true },
    select: { id: true },
  });
  if (!service) return { ok: false, error: "El servicio elegido no está disponible." };

  const date = businessDate(startsAt, shop.timezone);
  if (!bookableDates(businessDate(now, shop.timezone)).includes(date)) {
    return { ok: false, error: "Elegí un día dentro de las próximas dos semanas." };
  }

  // Hora en punto, dentro de alguna franja del día (no en el hueco de un horario cortado) y futura.
  // Misma función que la grilla pública (`getAvailableSlots`): no pueden divergir.
  const hours = await getDayHours(db, shop.id, date);
  const slots = computeHourlySlots({ hours, date, timeZone: shop.timezone, now });
  if (!slots.some((slot) => slot.getTime() === startsAt.getTime())) {
    return { ok: false, error: SLOT_UNAVAILABLE };
  }

  try {
    const appointment = await db.$transaction(async (tx) => {
      // Anti doble envío: serializa las reservas del mismo cliente (barbería + teléfono).
      const key = `booking:${shop.id}:${data.phone}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

      const duplicate = await tx.appointment.count({
        where: {
          barbershopId: shop.id,
          startsAt,
          status: { in: [...OPEN_APPOINTMENT_STATUSES] },
          customer: { phone: data.phone },
        },
      });
      if (duplicate > 0) throw new BookingRejected(ALREADY_BOOKED);

      // Upsert por (barbershopId, phone) sin carrera: `INSERT … ON CONFLICT DO NOTHING`
      // (createMany + skipDuplicates). Sólo actualiza el nombre si cambió; nunca toca `notes`.
      await tx.customer.createMany({
        data: [{ barbershopId: shop.id, phone: data.phone, name: data.name }],
        skipDuplicates: true,
      });
      const customer = await tx.customer.findUniqueOrThrow({
        where: { barbershopId_phone: { barbershopId: shop.id, phone: data.phone } },
        select: { id: true, name: true },
      });
      if (customer.name !== data.name) {
        await tx.customer.update({ where: { id: customer.id }, data: { name: data.name } });
      }

      return tx.appointment.create({
        data: {
          barbershopId: shop.id,
          customerId: customer.id,
          barberId: null,
          serviceId: service.id,
          startsAt,
          // Todos los turnos duran una hora, sin importar la duración del servicio.
          endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60_000),
          status: "PENDING",
        },
        select: { id: true, startsAt: true },
      });
    });

    return { ok: true, appointmentId: appointment.id, startsAt: appointment.startsAt.toISOString() };
  } catch (error) {
    if (error instanceof BookingRejected) return { ok: false, error: error.message };
    console.error("createPublicBooking", error);
    return { ok: false, error: "No pudimos confirmar la reserva. Probá de nuevo en unos minutos." };
  }
}
