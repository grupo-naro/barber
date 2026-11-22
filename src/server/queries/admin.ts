// Lecturas del panel de la PLATAFORMA. Ven todas las barberías a propósito: solo se llaman después de
// `requireAdminSession()`. Nunca devuelven `passwordHash` ni `tokenHash`.
import "server-only";
import { db } from "@/lib/db";
import { lastActivity, monthRange, type BarbershopStatusValue, type PlanValue } from "@/lib/platform-admin";
import { DEFAULT_TIMEZONE } from "@/lib/time";

export type AdminBarbershopRow = {
  id: string;
  name: string;
  slug: string;
  status: BarbershopStatusValue;
  plan: PlanValue;
  planExpiresAt: Date | null;
  billingEnabled: boolean;
  timezone: string;
  activeBarbers: number;
  appointmentsThisMonth: number;
  recordsThisMonth: number;
  lastActivityAt: Date | null;
};

/** `businessDate` ("YYYY-MM-DD") → valor de la columna `@db.Date`. */
function dateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function countMap(rows: { barbershopId: string; _count: { _all: number } }[]): Map<string, number> {
  return new Map(rows.map((row) => [row.barbershopId, row._count._all]));
}

function maxMap<K extends string>(
  rows: { barbershopId: string; _max: Partial<Record<K, Date | null>> }[],
  key: K,
): Map<string, Date | null> {
  return new Map(rows.map((row) => [row.barbershopId, row._max[key] ?? null]));
}

/**
 * Todas las barberías (filtradas por `q` en nombre o slug) con sus métricas del mes de negocio.
 * Cantidad CONSTANTE de queries sin importar cuántas barberías haya: un `findMany` + 6 `groupBy` por
 * `barbershopId` (en paralelo). El mes se calcula en la timezone de la plataforma (Buenos Aires).
 */
export async function listBarbershopsWithMetrics(q: string, now: Date = new Date()): Promise<AdminBarbershopRow[]> {
  const shops = await db.barbershop.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: true,
      planExpiresAt: true,
      billingEnabled: true,
      timezone: true,
    },
  });
  if (shops.length === 0) return [];

  const ids = shops.map((shop) => shop.id);
  const inShops = { barbershopId: { in: ids } };
  const month = monthRange(now, DEFAULT_TIMEZONE);

  const [barbers, appointmentsMonth, recordsMonth, lastRecord, lastAppointment, lastLogin] = await Promise.all([
    db.user.groupBy({
      by: ["barbershopId"],
      where: { ...inShops, role: "BARBER", active: true, passwordHash: { not: null } },
      _count: { _all: true },
    }),
    db.appointment.groupBy({
      by: ["barbershopId"],
      where: { ...inShops, startsAt: { gte: month.start, lt: month.end } },
      _count: { _all: true },
    }),
    db.serviceRecord.groupBy({
      by: ["barbershopId"],
      where: { ...inShops, businessDate: { gte: dateColumn(month.startDate), lt: dateColumn(month.endDate) } },
      _count: { _all: true },
    }),
    db.serviceRecord.groupBy({ by: ["barbershopId"], where: inShops, _max: { createdAt: true } }),
    db.appointment.groupBy({ by: ["barbershopId"], where: inShops, _max: { createdAt: true } }),
    db.user.groupBy({ by: ["barbershopId"], where: inShops, _max: { lastLoginAt: true } }),
  ]);

  const barberCount = countMap(barbers);
  const appointmentCount = countMap(appointmentsMonth);
  const recordCount = countMap(recordsMonth);
  const lastRecordAt = maxMap(lastRecord, "createdAt");
  const lastAppointmentAt = maxMap(lastAppointment, "createdAt");
  const lastLoginAt = maxMap(lastLogin, "lastLoginAt");

  return shops.map((shop) => ({
    ...shop,
    activeBarbers: barberCount.get(shop.id) ?? 0,
    appointmentsThisMonth: appointmentCount.get(shop.id) ?? 0,
    recordsThisMonth: recordCount.get(shop.id) ?? 0,
    lastActivityAt: lastActivity(lastRecordAt.get(shop.id), lastAppointmentAt.get(shop.id), lastLoginAt.get(shop.id)),
  }));
}

export type AdminBarbershopDetail = {
  id: string;
  name: string;
  slug: string;
  status: BarbershopStatusValue;
  plan: PlanValue;
  planExpiresAt: Date | null;
  timezone: string;
  createdAt: Date;
  billingEnabled: boolean;
  /** Monto mensual como string decimal (de `Decimal`), o `null`. */
  monthlyAmount: string | null;
  mpPreapprovalId: string | null;
  mpInitPoint: string | null;
  mpStatus: string | null;
  payerEmail: string | null;
  owner: { id: string; name: string; email: string; hasPassword: boolean; active: boolean } | null;
};

export type AdminSubscriptionPayment = {
  id: string;
  source: "MERCADOPAGO" | "MANUAL";
  /** String decimal (de `Decimal`). */
  amount: string;
  paidAt: Date;
  coversUntil: Date;
  note: string | null;
  suspectedDuplicate: boolean;
  duplicateReviewedAt: Date | null;
};

/** Detalle de una barbería con su dueño (el OWNER más antiguo). `null` si el id no existe. */
export async function getBarbershopForAdmin(id: string): Promise<AdminBarbershopDetail | null> {
  if (id.length > 100) return null;
  const shop = await db.barbershop.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: true,
      planExpiresAt: true,
      timezone: true,
      createdAt: true,
      billingEnabled: true,
      monthlyAmount: true,
      mpPreapprovalId: true,
      mpInitPoint: true,
      mpStatus: true,
      payerEmail: true,
      users: {
        where: { role: "OWNER" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, name: true, email: true, passwordHash: true, active: true },
      },
    },
  });
  if (!shop) return null;
  const { users, monthlyAmount, ...rest } = shop;
  const owner = users[0];
  return {
    ...rest,
    monthlyAmount: monthlyAmount ? monthlyAmount.toString() : null,
    owner: owner
      ? { id: owner.id, name: owner.name, email: owner.email, hasPassword: owner.passwordHash !== null, active: owner.active }
      : null,
  };
}

/** Historial de pagos de la suscripción de una barbería, del más reciente al más viejo (hasta 100). */
export async function listSubscriptionPayments(barbershopId: string): Promise<AdminSubscriptionPayment[]> {
  const rows = await db.subscriptionPayment.findMany({
    where: { barbershopId },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      source: true,
      amount: true,
      paidAt: true,
      coversUntil: true,
      note: true,
      suspectedDuplicate: true,
      duplicateReviewedAt: true,
    },
  });
  return rows.map((row) => ({ ...row, amount: row.amount.toString() }));
}
