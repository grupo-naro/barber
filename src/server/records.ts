// Creación de registros del "Cuaderno Digital" (cortes realizados) y cambios de estado de turnos del día.
// Sin dependencias de Next para poder llamarlo desde scripts (p. ej. un `Promise.all` de walk-ins).
// El llamador pasa el `actor` y el `barbershopId` SIEMPRE tomados de la sesión del servidor.
//
// Número diario: dentro de la transacción se toma `pg_advisory_xact_lock` por (barbería, día), se lee
// `max(dailyNumber) + 1` y se inserta. Como red de seguridad, ante `P2002` se reintenta la transacción.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  MAX_CREATE_ATTEMPTS,
  OPEN_APPOINTMENT_STATUSES,
  businessDateToDb,
  dayBoundsUtc,
  isUniqueViolation,
  nextDailyNumber,
  resolveCompletingBarber,
  sumPrices,
  type PaymentMethodValue,
} from "@/lib/records";
import { businessDate } from "@/lib/time";

export type Actor = { userId: string; role: "OWNER" | "BARBER" };

export type ShopContext = {
  barbershopId: string;
  timeZone: string;
  actor: Actor;
  now?: Date;
};

export type RecordResult =
  | { ok: true; recordId: string; dailyNumber: number; total: string }
  | { ok: false; error: string };

export type StatusResult = { ok: true } | { ok: false; error: string };

export const DAY_CLOSED = "La caja de hoy ya está cerrada.";
const APPOINTMENT_NOT_FOUND = "No encontramos ese turno entre los de hoy.";
const APPOINTMENT_NOT_OPEN = "Ese turno ya no está pendiente: puede que alguien lo haya completado o cancelado.";
const SERVICES_UNAVAILABLE = "Algún servicio elegido no existe o está inactivo. Recargá la página.";

/** Rechazo esperado (se muestra al usuario); cualquier otro error se loguea y devuelve un mensaje genérico. */
class RecordRejected extends Error {}

type Tx = Prisma.TransactionClient;

function today(ctx: ShopContext): string {
  return businessDate(ctx.now ?? new Date(), ctx.timeZone);
}

/** Serializa las altas de un mismo día de una barbería. */
async function lockDay(tx: Tx, barbershopId: string, date: string) {
  const key = `records:${barbershopId}:${date}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

async function assertDayOpen(tx: Tx, barbershopId: string, date: string) {
  const closed = await tx.cashRegisterClose.findUnique({
    where: { barbershopId_businessDate: { barbershopId, businessDate: businessDateToDb(date) } },
    select: { id: true },
  });
  if (closed) throw new RecordRejected(DAY_CLOSED);
}

/**
 * Servicios a cobrar, en el orden pedido, con el precio vigente leído de la DB (nunca del cliente).
 * Sólo de la barbería y activos; `allowInactiveId` permite el servicio original del turno aunque se haya desactivado.
 */
async function loadServices(tx: Tx, barbershopId: string, serviceIds: readonly string[], allowInactiveId?: string) {
  const ids = [...new Set(serviceIds)];
  if (ids.length === 0) throw new RecordRejected("Elegí al menos un servicio.");
  const services = await tx.service.findMany({
    where: {
      barbershopId,
      id: { in: ids },
      OR: [{ active: true }, ...(allowInactiveId ? [{ id: allowInactiveId }] : [])],
    },
    select: { id: true, name: true, price: true },
  });
  if (services.length !== ids.length) throw new RecordRejected(SERVICES_UNAVAILABLE);
  const byId = new Map(services.map((s) => [s.id, s]));
  return ids.map((id) => byId.get(id)!);
}

async function insertRecord(
  tx: Tx,
  data: {
    barbershopId: string;
    date: string;
    barberId: string;
    customerId: string | null;
    appointmentId: string | null;
    paymentMethod: PaymentMethodValue;
    services: { id: string; name: string; price: { toString(): string } }[];
  },
) {
  const businessDateDb = businessDateToDb(data.date);
  const { _max } = await tx.serviceRecord.aggregate({
    where: { barbershopId: data.barbershopId, businessDate: businessDateDb },
    _max: { dailyNumber: true },
  });
  const total = sumPrices(data.services.map((s) => s.price));
  return tx.serviceRecord.create({
    data: {
      barbershopId: data.barbershopId,
      businessDate: businessDateDb,
      dailyNumber: nextDailyNumber(_max.dailyNumber),
      barberId: data.barberId,
      customerId: data.customerId,
      appointmentId: data.appointmentId,
      paymentMethod: data.paymentMethod,
      total,
      items: {
        create: data.services.map((s) => ({ serviceId: s.id, serviceName: s.name, priceCharged: sumPrices([s.price]) })),
      },
    },
    select: { id: true, dailyNumber: true, total: true },
  });
}

/** Corre `work` en una transacción, reintentando ante `P2002`; traduce rechazos y errores a `RecordResult`. */
async function runRecordTransaction(
  label: string,
  work: (tx: Tx) => Promise<{ id: string; dailyNumber: number; total: { toString(): string } }>,
): Promise<RecordResult> {
  for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
    try {
      const record = await db.$transaction(work, { maxWait: 10_000, timeout: 15_000 });
      return { ok: true, recordId: record.id, dailyNumber: record.dailyNumber, total: sumPrices([record.total]) };
    } catch (error) {
      if (error instanceof RecordRejected) return { ok: false, error: error.message };
      if (isUniqueViolation(error) && attempt < MAX_CREATE_ATTEMPTS) continue;
      console.error(label, error);
      return { ok: false, error: "No pudimos guardar el registro. Probá de nuevo." };
    }
  }
  return { ok: false, error: "No pudimos guardar el registro. Probá de nuevo." };
}

/** Filtro de un turno abierto de hoy de la barbería; un BARBER sólo ve los propios y los sin asignar. */
function openAppointmentWhere(ctx: ShopContext, appointmentId: string, date: string): Prisma.AppointmentWhereInput {
  const [start, end] = dayBoundsUtc(date, ctx.timeZone);
  return {
    id: appointmentId,
    barbershopId: ctx.barbershopId,
    startsAt: { gte: start, lt: end },
    status: { in: [...OPEN_APPOINTMENT_STATUSES] },
    ...(ctx.actor.role === "BARBER" ? { OR: [{ barberId: ctx.actor.userId }, { barberId: null }] } : {}),
  };
}

export type CompleteAppointmentInput = {
  appointmentId: string;
  paymentMethod: PaymentMethodValue;
  serviceIds: readonly string[];
  /** Quién atendió; `""`/`null`/`undefined` = el usuario de la sesión. Un BARBER no puede elegir otro. */
  barberId?: string | null;
};

/**
 * Completa un turno de hoy: en una transacción lo pasa a COMPLETED y le asigna el barbero que atendió
 * (en el mismo update condicional) y crea el `ServiceRecord` con ese barbero y sus items. Completar dos
 * veces (incluso en paralelo) deja un solo registro.
 */
export async function completeAppointmentRecord(
  ctx: ShopContext,
  input: CompleteAppointmentInput,
): Promise<RecordResult> {
  const date = today(ctx);
  const resolved = resolveCompletingBarber(ctx.actor, input.barberId);
  if (!resolved.ok) return resolved;

  return runRecordTransaction("completeAppointmentRecord", async (tx) => {
    await lockDay(tx, ctx.barbershopId, date);
    await assertDayOpen(tx, ctx.barbershopId, date);

    const where = openAppointmentWhere(ctx, input.appointmentId, date);
    const appointment = await tx.appointment.findFirst({
      where,
      select: { id: true, customerId: true, serviceId: true },
    });
    if (!appointment) {
      // ¿Existe pero ya no está abierto? Mensaje más claro, sin filtrar datos ajenos.
      const exists = await tx.appointment.count({ where: { ...where, status: undefined } });
      throw new RecordRejected(exists ? APPOINTMENT_NOT_OPEN : APPOINTMENT_NOT_FOUND);
    }

    // El barbero que atendió: activo y de la barbería de la sesión (nunca de otro tenant).
    const barber = await tx.user.findFirst({
      where: { id: resolved.barberId, barbershopId: ctx.barbershopId, active: true },
      select: { id: true },
    });
    if (!barber) throw new RecordRejected("El barbero elegido no está disponible.");

    const { count } = await tx.appointment.updateMany({
      where,
      data: { status: "COMPLETED", barberId: barber.id },
    });
    if (count !== 1) throw new RecordRejected(APPOINTMENT_NOT_OPEN);

    const services = await loadServices(tx, ctx.barbershopId, input.serviceIds, appointment.serviceId);
    return insertRecord(tx, {
      barbershopId: ctx.barbershopId,
      date,
      barberId: barber.id,
      customerId: appointment.customerId,
      appointmentId: appointment.id,
      paymentMethod: input.paymentMethod,
      services,
    });
  });
}

/** Marca un turno abierto de hoy como "no vino" o cancelado. No crea registro. */
export async function setTodayAppointmentStatus(
  ctx: ShopContext,
  appointmentId: string,
  status: "NO_SHOW" | "CANCELLED",
): Promise<StatusResult> {
  const where = openAppointmentWhere(ctx, appointmentId, today(ctx));
  const { count } = await db.appointment.updateMany({ where, data: { status } });
  if (count === 1) return { ok: true };
  const exists = await db.appointment.count({ where: { ...where, status: undefined } });
  return { ok: false, error: exists ? APPOINTMENT_NOT_OPEN : APPOINTMENT_NOT_FOUND };
}

export type WalkInInput = {
  /** Barbero elegido; `undefined`/`null` = el usuario de la sesión. Un BARBER no puede elegir otro. */
  barberId?: string | null;
  serviceIds: readonly string[];
  paymentMethod: PaymentMethodValue;
  /** Cliente opcional: teléfono ya normalizado (sólo dígitos) y nombre para el alta si no existe. */
  customer?: { phone: string; name?: string | null } | null;
};

/** Registra un corte walk-in. Find-or-create del cliente por teléfono dentro de la barbería, sin pisar `notes`. */
export async function createWalkInRecord(ctx: ShopContext, input: WalkInInput): Promise<RecordResult> {
  const date = today(ctx);
  const barberId = input.barberId || ctx.actor.userId;
  if (ctx.actor.role === "BARBER" && barberId !== ctx.actor.userId) {
    return { ok: false, error: "Sólo podés registrar cortes a tu nombre." };
  }

  return runRecordTransaction("createWalkInRecord", async (tx) => {
    const barber = await tx.user.findFirst({
      where: { id: barberId, barbershopId: ctx.barbershopId, active: true },
      select: { id: true },
    });
    if (!barber) throw new RecordRejected("El barbero elegido no está disponible.");

    const services = await loadServices(tx, ctx.barbershopId, input.serviceIds);

    let customerId: string | null = null;
    if (input.customer) {
      const { phone } = input.customer;
      const name = input.customer.name?.trim() || null;
      if (name) {
        // Upsert sin carrera: `INSERT … ON CONFLICT DO NOTHING` y después leer. Nunca toca nombre ni notas existentes.
        await tx.customer.createMany({
          data: [{ barbershopId: ctx.barbershopId, phone, name }],
          skipDuplicates: true,
        });
      }
      const customer = await tx.customer.findUnique({
        where: { barbershopId_phone: { barbershopId: ctx.barbershopId, phone } },
        select: { id: true },
      });
      if (!customer) throw new RecordRejected("Ese teléfono no está registrado: ingresá el nombre del cliente.");
      customerId = customer.id;
    }

    await lockDay(tx, ctx.barbershopId, date);
    await assertDayOpen(tx, ctx.barbershopId, date);
    return insertRecord(tx, {
      barbershopId: ctx.barbershopId,
      date,
      barberId: barber.id,
      customerId,
      appointmentId: null,
      paymentMethod: input.paymentMethod,
      services,
    });
  });
}
