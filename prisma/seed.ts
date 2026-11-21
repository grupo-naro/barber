/**
 * Seed de demo — `pnpm db:seed` (o `pnpm exec prisma db seed`).
 *
 * Usuarios (TODOS con la contraseña `barber123`, guardada hasheada con scrypt):
 *   barberia-demo:  owner@barberia-demo.test (OWNER)
 *                   martin@barberia-demo.test, lucas@barberia-demo.test, nico@barberia-demo.test (BARBER)
 *   otra-barberia:  owner@otra-barberia.test (OWNER)
 *
 * Idempotente: borra y recrea SOLO los tenants con slug `barberia-demo` y `otra-barberia`.
 * Los turnos cubren la semana en curso (lunes a domingo) calculada en la timezone de la barbería:
 * siempre en punto, de 1 h, a veces varios en la misma hora; los futuros quedan sin barbero asignado.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";
import { businessDate } from "../src/lib/time";

const SEED_PASSWORD = "barber123";
const TIMEZONE = "America/Argentina/Buenos_Aires";
const SEED_SLUGS = ["barberia-demo", "otra-barberia"];

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// ---------- utilidades de tiempo (timezone de la barbería) ----------

/** Offset (ms) de `timeZone` respecto de UTC en el instante `utcMs`. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Instante UTC de una fecha "YYYY-MM-DD" + minutos desde medianoche, en la timezone dada. */
function zonedToUtc(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const offset = tzOffsetMs(guess, timeZone);
  return new Date(guess - tzOffsetMs(guess - offset, timeZone));
}

/** Días ("YYYY-MM-DD") de la semana en curso, lunes a domingo, en la timezone dada. */
function currentWeek(now: Date, timeZone: string): string[] {
  const today = businessDate(now, timeZone);
  const [y, m, d] = today.split("-").map(Number);
  const todayUtc = Date.UTC(y, m - 1, d);
  const weekday = new Date(todayUtc).getUTCDay(); // 0 = domingo
  const monday = todayUtc - ((weekday + 6) % 7) * 86_400_000;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * 86_400_000).toISOString().slice(0, 10));
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** PRNG determinístico (mulberry32): mismos turnos en cada corrida de la misma semana. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- datos ----------

// weekday: 0 = domingo … 6 = sábado. Una fila por franja: el martes de la demo es horario
// cortado (10–14 y 17–21). `otra-barberia` mantiene el martes corrido 10–20.
type OpeningHoursSeed = { weekday: number; opensAt: string | null; closesAt: string | null; closed: boolean };

const OPENING_HOURS: OpeningHoursSeed[] = [
  { weekday: 0, opensAt: null, closesAt: null, closed: true },
  { weekday: 1, opensAt: "10:00", closesAt: "20:00", closed: false },
  { weekday: 2, opensAt: "10:00", closesAt: "20:00", closed: false },
  { weekday: 3, opensAt: "10:00", closesAt: "20:00", closed: false },
  { weekday: 4, opensAt: "10:00", closesAt: "20:00", closed: false },
  { weekday: 5, opensAt: "10:00", closesAt: "21:00", closed: false },
  { weekday: 6, opensAt: "09:00", closesAt: "18:00", closed: false },
];

const DEMO_OPENING_HOURS: OpeningHoursSeed[] = [
  ...OPENING_HOURS.filter((h) => h.weekday !== 2),
  { weekday: 2, opensAt: "10:00", closesAt: "14:00", closed: false },
  { weekday: 2, opensAt: "17:00", closesAt: "21:00", closed: false },
].sort((a, b) => a.weekday - b.weekday);

/** Horas en punto de un día con turno de 1 h dentro de alguna franja abierta (unión ordenada). */
function bookableHours(hours: readonly OpeningHoursSeed[], weekday: number): number[] {
  const out = new Set<number>();
  for (const h of hours) {
    if (h.weekday !== weekday || h.closed || !h.opensAt || !h.closesAt) continue;
    const opens = toMinutes(h.opensAt);
    const closes = toMinutes(h.closesAt);
    for (let hour = Math.ceil(opens / 60); hour * 60 + 60 <= closes; hour++) out.add(hour);
  }
  return [...out].sort((a, b) => a - b);
}

const SERVICES = [
  { name: "Corte de pelo", description: "Corte a tijera o máquina, lavado y peinado.", price: "15000", durationMinutes: 30 },
  { name: "Corte + barba", description: "Corte completo y perfilado de barba con toalla caliente.", price: "21000", durationMinutes: 45 },
  { name: "Arreglo de barba", description: "Perfilado, rebaje y navaja.", price: "9000", durationMinutes: 20 },
  { name: "Fade / degradé", description: "Degradé a navaja o máquina con terminación prolija.", price: "17000", durationMinutes: 45 },
  { name: "Corte infantil", description: "Para menores de 12 años.", price: "12000", durationMinutes: 30 },
  { name: "Color / mechas", description: "Decoloración o tintura con producto profesional.", price: "35000", durationMinutes: 90 },
  { name: "Perfilado de cejas", description: "Con navaja o pinza.", price: "4000", durationMinutes: 15 },
];

const BARBERS = [
  { email: "martin@barberia-demo.test", name: "Martín Gómez", payoutScheme: "PERCENTAGE", payoutValue: "50" },
  { email: "lucas@barberia-demo.test", name: "Lucas Fernández", payoutScheme: "PERCENTAGE", payoutValue: "40" },
  { email: "nico@barberia-demo.test", name: "Nicolás Romero", payoutScheme: "FIXED_RENT", payoutValue: "120000" },
] as const;

const CUSTOMERS = [
  ["Juan Pérez", "Siempre degradé bajo, 2 al costado."],
  ["Santiago López", null],
  ["Mateo González", "Tijera arriba, no muy corto."],
  ["Tomás Rodríguez", null],
  ["Facundo Martínez", "Barba candado."],
  ["Agustín Sánchez", null],
  ["Joaquín Díaz", null],
  ["Franco Álvarez", "Alérgico a la loción con alcohol."],
  ["Bautista Torres", null],
  ["Thiago Ruiz", "Corte infantil, viene con la mamá."],
  ["Lautaro Ramírez", null],
  ["Ignacio Flores", "1 y medio a los costados."],
  ["Valentín Acosta", null],
  ["Benjamín Benítez", null],
  ["Ezequiel Medina", "Mechas platinadas cada 2 meses."],
  ["Gonzalo Herrera", null],
  ["Federico Suárez", null],
  ["Ramiro Aguirre", "Prefiere a Nico."],
] as const;

// ---------- seed ----------

async function wipeSeedTenants() {
  const shops = await db.barbershop.findMany({ where: { slug: { in: SEED_SLUGS } }, select: { id: true } });
  const ids = shops.map((s) => s.id);
  if (ids.length === 0) return;
  const inShops = { barbershopId: { in: ids } };
  await db.$transaction([
    db.serviceRecordItem.deleteMany({ where: { serviceRecord: inShops } }),
    db.barberPayout.deleteMany({ where: { cashClose: inShops } }),
    db.serviceRecord.deleteMany({ where: inShops }),
    db.cashRegisterClose.deleteMany({ where: inShops }),
    db.appointment.deleteMany({ where: inShops }),
    db.customer.deleteMany({ where: inShops }),
    db.service.deleteMany({ where: inShops }),
    db.openingHours.deleteMany({ where: inShops }),
    db.user.deleteMany({ where: inShops }),
    db.barbershop.deleteMany({ where: { id: { in: ids } } }),
  ]);
}

async function seedDemo(now: Date) {
  const shop = await db.barbershop.create({
    data: {
      slug: "barberia-demo",
      name: "Barbería Demo",
      description: "Barbería clásica en Palermo. Cortes, barba y degradés con turno o por orden de llegada.",
      address: "Av. Santa Fe 3456, Palermo, CABA",
      phone: "+54 11 4832-5566",
      whatsapp: "+5491155443322",
      timezone: TIMEZONE,
      openingHours: { create: DEMO_OPENING_HOURS },
      services: {
        create: SERVICES.map((s, i) => ({ ...s, price: new Prisma.Decimal(s.price), sortOrder: i })),
      },
    },
    include: { services: true },
  });

  await db.user.create({
    data: {
      barbershopId: shop.id,
      email: "owner@barberia-demo.test",
      name: "Carlos Benítez",
      role: "OWNER",
      passwordHash: await hashPassword(SEED_PASSWORD), // salt propio por usuario
      payoutScheme: "NONE",
    },
  });

  const barbers = [];
  for (const b of BARBERS) {
    barbers.push(
      await db.user.create({
        data: {
          barbershopId: shop.id,
          email: b.email,
          name: b.name,
          role: "BARBER",
          passwordHash: await hashPassword(SEED_PASSWORD), // salt propio por usuario
          payoutScheme: b.payoutScheme,
          payoutValue: new Prisma.Decimal(b.payoutValue),
        },
      }),
    );
  }

  await db.customer.createMany({
    data: CUSTOMERS.map(([name, notes], i) => ({
      barbershopId: shop.id,
      name,
      notes,
      // Celulares de CABA/AMBA en formato E.164, únicos.
      phone: `+54911${String(55_000_101 + i * 37).padStart(8, "0")}`,
    })),
  });
  const customers = await db.customer.findMany({ where: { barbershopId: shop.id }, orderBy: { phone: "asc" } });

  // Turnos de la semana en curso, siempre en punto (HH:00) y de 1 h, dentro del horario. Varios turnos
  // pueden compartir la hora (se atiende por orden de llegada); otras horas quedan vacías.
  // Futuros abiertos: sin barbero (se asigna al completar). Pasados COMPLETED: con barbero.
  const week = currentWeek(now, TIMEZONE);
  const random = rng(Number(week[0].replaceAll("-", "")));
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
  // Servicios más pedidos aparecen más seguido.
  const servicePool = shop.services.flatMap((s) => {
    const weight = { "Corte de pelo": 5, "Corte + barba": 4, "Fade / degradé": 3, "Arreglo de barba": 2 }[s.name] ?? 1;
    return Array.from({ length: weight }, () => s);
  });
  /** Cuántos turnos en una hora: 0 (30%), 1 (35%), 2 (25%), 3 (10%). */
  const perHour = () => {
    const roll = random();
    return roll < 0.3 ? 0 : roll < 0.65 ? 1 : roll < 0.9 ? 2 : 3;
  };

  const appointments: Prisma.AppointmentCreateManyInput[] = [];
  for (const date of week) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    // Domingo cerrado: sin turnos. Martes cortado: ninguno en el hueco de 14 a 17.
    const dayHours = bookableHours(DEMO_OPENING_HOURS, weekday);

    for (const [hourIndex, h] of dayHours.entries()) {
      // La segunda hora de cada día siempre tiene 2–3 turnos (para ver turnos compartiendo la hora).
      const count = hourIndex === 1 ? 2 + Math.floor(random() * 2) : perHour();
      const startsAt = zonedToUtc(date, h * 60, TIMEZONE);
      const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
      // Clientes distintos dentro de la misma hora (un cliente no reserva dos veces la misma hora).
      const hourCustomers = [...customers].sort(() => random() - 0.5).slice(0, count);

      for (const customer of hourCustomers) {
        const roll = random();
        const past = startsAt < now;
        const status = past
          ? roll < 0.8 ? "COMPLETED" : roll < 0.9 ? "NO_SHOW" : "CANCELLED"
          : roll < 0.6 ? "CONFIRMED" : "PENDING";
        // COMPLETED siempre con quien atendió; NO_SHOW/CANCELLED pasados, a veces sin asignar.
        const barberId =
          status === "COMPLETED" ? pick(barbers).id : past && random() < 0.5 ? pick(barbers).id : null;

        appointments.push({
          barbershopId: shop.id,
          barberId,
          customerId: customer.id,
          serviceId: pick(servicePool).id,
          startsAt,
          endsAt,
          status,
        });
      }
    }
  }
  await db.appointment.createMany({ data: appointments });

  return { shop, appointments: appointments.length, week };
}

async function seedOther() {
  return db.barbershop.create({
    data: {
      slug: "otra-barberia",
      name: "Otra Barbería",
      description: "Barbería de barrio en Rosario.",
      address: "Bv. Oroño 1234, Rosario, Santa Fe",
      whatsapp: "+5493415556677",
      timezone: TIMEZONE,
      openingHours: { create: OPENING_HOURS },
      users: {
        create: {
          email: "owner@otra-barberia.test",
          name: "Diego Castro",
          role: "OWNER",
          passwordHash: await hashPassword(SEED_PASSWORD), // salt propio por usuario
          payoutScheme: "NONE",
        },
      },
      services: {
        create: [{ name: "Corte clásico", price: new Prisma.Decimal("13000"), durationMinutes: 30 }],
      },
    },
  });
}

async function main() {
  const now = new Date();

  await wipeSeedTenants();
  const demo = await seedDemo(now);
  await seedOther();

  const ids = (await db.barbershop.findMany({ where: { slug: { in: SEED_SLUGS } } })).map((s) => s.id);
  const where = { barbershopId: { in: ids } };
  const [users, services, customers, appointments, openingHours] = await Promise.all([
    db.user.count({ where }),
    db.service.count({ where }),
    db.customer.count({ where }),
    db.appointment.count({ where }),
    db.openingHours.count({ where }),
  ]);
  console.log(`Semana ${demo.week[0]} → ${demo.week[6]} (${TIMEZONE})`);
  console.log(
    `Seed OK: barberías=${ids.length} usuarios=${users} servicios=${services} clientes=${customers} ` +
      `turnos=${appointments} horarios=${openingHours}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
