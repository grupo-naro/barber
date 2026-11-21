import "server-only";
// Lecturas del "Cuaderno Digital". El `barbershopId` y el actor los pasa el llamador y SIEMPRE salen
// de la sesión del servidor (`requireSession()`), nunca del cliente. Un BARBER sólo ve lo propio.
import { db } from "@/lib/db";
import { centsToPrice, priceToCents } from "@/lib/pricing";
import { businessDateToDb, dayBoundsUtc, sumPrices, type PaymentMethodValue } from "@/lib/records";
import { businessDate } from "@/lib/time";
import type { Actor } from "@/server/records";

export type TodayScope = { barbershopId: string; timeZone: string; actor: Actor; now?: Date };

export type AppointmentStatusValue = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export type TodayAppointment = {
  id: string;
  startsAt: Date;
  status: AppointmentStatusValue;
  notes: string | null;
  customer: { id: string; name: string; phone: string; notes: string | null };
  /** `null` = sin asignar (el barbero se elige al completar). */
  barber: { id: string; name: string } | null;
  service: { id: string; name: string; price: string; active: boolean };
};

export type TodayRecord = {
  id: string;
  dailyNumber: number;
  createdAt: Date;
  paymentMethod: PaymentMethodValue;
  total: string;
  barber: { id: string; name: string };
  customer: { id: string; name: string } | null;
  items: { id: string; serviceName: string; priceCharged: string }[];
  fromAppointment: boolean;
};

export type ServiceOption = { id: string; name: string; price: string };
export type BarberOption = { id: string; name: string };

function price(value: { toString(): string }): string {
  return centsToPrice(priceToCents(value));
}

/** Registros: un BARBER sólo ve los suyos. */
function barberFilter(scope: TodayScope) {
  return scope.actor.role === "BARBER" ? { barberId: scope.actor.userId } : {};
}

/** Turnos: un BARBER ve los suyos y los sin asignar (no los asignados a otros). */
function appointmentBarberFilter(scope: TodayScope) {
  return scope.actor.role === "BARBER" ? { OR: [{ barberId: scope.actor.userId }, { barberId: null }] } : {};
}

/** Día de negocio de hoy ("YYYY-MM-DD") en la timezone de la barbería. */
export function todayOf(scope: TodayScope): string {
  return businessDate(scope.now ?? new Date(), scope.timeZone);
}

/** Turnos cuyo `startsAt` cae en el día de negocio, por hora y, dentro de la misma hora, por orden de reserva. */
export async function listTodayAppointments(scope: TodayScope, date: string): Promise<TodayAppointment[]> {
  const [start, end] = dayBoundsUtc(date, scope.timeZone);
  const rows = await db.appointment.findMany({
    where: { barbershopId: scope.barbershopId, startsAt: { gte: start, lt: end }, ...appointmentBarberFilter(scope) },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      startsAt: true,
      status: true,
      notes: true,
      customer: { select: { id: true, name: true, phone: true, notes: true } },
      barber: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, price: true, active: true } },
    },
  });
  return rows.map((row) => ({ ...row, service: { ...row.service, price: price(row.service.price) } }));
}

/** Registros del día de negocio, por número diario. */
export async function listTodayRecords(scope: TodayScope, date: string): Promise<TodayRecord[]> {
  const rows = await db.serviceRecord.findMany({
    where: { barbershopId: scope.barbershopId, businessDate: businessDateToDb(date), ...barberFilter(scope) },
    orderBy: { dailyNumber: "asc" },
    select: {
      id: true,
      dailyNumber: true,
      createdAt: true,
      paymentMethod: true,
      total: true,
      appointmentId: true,
      barber: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      items: { select: { id: true, serviceName: true, priceCharged: true }, orderBy: { id: "asc" } },
    },
  });
  return rows.map(({ appointmentId, ...row }) => ({
    ...row,
    total: price(row.total),
    items: row.items.map((item) => ({ ...item, priceCharged: price(item.priceCharged) })),
    fromAppointment: appointmentId !== null,
  }));
}

/** Total exacto de una lista de registros. */
export function totalOf(records: readonly TodayRecord[]): string {
  return sumPrices(records.map((r) => r.total));
}

/** `true` si ya hay cierre de caja para ese día. */
export async function isDayClosed(barbershopId: string, date: string): Promise<boolean> {
  const close = await db.cashRegisterClose.findUnique({
    where: { barbershopId_businessDate: { barbershopId, businessDate: businessDateToDb(date) } },
    select: { id: true },
  });
  return close !== null;
}

/** Servicios activos de la barbería para los chips. */
export async function listActiveServiceOptions(barbershopId: string): Promise<ServiceOption[]> {
  const rows = await db.service.findMany({
    where: { barbershopId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, price: true },
  });
  return rows.map((row) => ({ ...row, price: price(row.price) }));
}

/** Usuarios activos de la barbería (posibles barberos de un walk-in). */
export async function listActiveBarbers(barbershopId: string): Promise<BarberOption[]> {
  return db.user.findMany({
    where: { barbershopId, active: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}

export type CustomerHistory = {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  records: {
    id: string;
    businessDate: string;
    dailyNumber: number;
    total: string;
    barber: string;
    services: string[];
  }[];
};

/** Ficha de un cliente de la barbería con sus últimos 10 registros, o `null` si no existe o es de otra barbería. */
export async function getCustomerHistory(barbershopId: string, id: string): Promise<CustomerHistory | null> {
  const customer = await db.customer.findFirst({
    where: { id, barbershopId },
    select: {
      id: true,
      name: true,
      phone: true,
      notes: true,
      serviceRecords: {
        where: { barbershopId },
        orderBy: [{ businessDate: "desc" }, { dailyNumber: "desc" }],
        take: 10,
        select: {
          id: true,
          businessDate: true,
          dailyNumber: true,
          total: true,
          barber: { select: { name: true } },
          items: { select: { serviceName: true }, orderBy: { id: "asc" } },
        },
      },
    },
  });
  if (!customer) return null;
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    notes: customer.notes,
    records: customer.serviceRecords.map((r) => ({
      id: r.id,
      businessDate: r.businessDate.toISOString().slice(0, 10),
      dailyNumber: r.dailyNumber,
      total: price(r.total),
      barber: r.barber.name,
      services: r.items.map((i) => i.serviceName),
    })),
  };
}
