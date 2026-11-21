// Fixture + smoke test del cierre de caja y la liquidación de barberos (job 006).
//   pnpm exec tsx scripts/cash-smoke.ts
// Borra y recrea (idempotente) las barberías `smoke-006` y `smoke-006-other` con un barbero de cada
// esquema y `ServiceRecord` + `ServiceRecordItem` insertados directo en la DB. Verifica `closeCashDay`
// (la misma lógica que usa la action) y deja datos para probar `/dashboard/cash` a mano:
//   - ayer: caja cerrada por el smoke (snapshot).
//   - hoy: caja abierta con registros (vista previa).
// Login: dueno@smoke-006.test / barber123 (OWNER) · bruno@smoke-006.test / barber123 (BARBER).
import "dotenv/config";
import type { PaymentMethod } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { addDays } from "@/lib/slots";
import { businessDate } from "@/lib/time";
import { CLOSE_ERRORS, closeCashDay, dateColumn, getCashDay, type CashDay } from "@/server/queries/cash";

const SLUG = "smoke-006";
const OTHER_SLUG = "smoke-006-other";
const TZ = "America/Argentina/Buenos_Aires";
const PASSWORD = "barber123";

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const money = (amount: string) => ars.format(amount as Intl.StringNumericLiteral);

const failures: string[] = [];
function check(condition: boolean, label: string) {
  console.log(`${condition ? "  ✓" : "  ✗"} ${label}`);
  if (!condition) failures.push(label);
}

async function wipe(slug: string) {
  const shop = await db.barbershop.findUnique({ where: { slug }, select: { id: true } });
  if (!shop) return;
  // Orden explícito: las FKs a User (barbero, quien cerró) no son en cascada.
  await db.serviceRecord.deleteMany({ where: { barbershopId: shop.id } });
  await db.cashRegisterClose.deleteMany({ where: { barbershopId: shop.id } });
  await db.appointment.deleteMany({ where: { barbershopId: shop.id } });
  await db.customer.deleteMany({ where: { barbershopId: shop.id } });
  await db.barbershop.delete({ where: { id: shop.id } });
}

type RecordSpec = [barber: string, method: PaymentMethod, total: string];

async function insertRecords(barbershopId: string, date: string, barberIds: Record<string, string>, specs: RecordSpec[]) {
  const last = await db.serviceRecord.aggregate({
    where: { barbershopId, businessDate: dateColumn(date) },
    _max: { dailyNumber: true },
  });
  let n = last._max.dailyNumber ?? 0;
  for (const [barber, paymentMethod, total] of specs) {
    n += 1;
    await db.serviceRecord.create({
      data: {
        barbershopId,
        businessDate: dateColumn(date),
        dailyNumber: n,
        barberId: barberIds[barber],
        paymentMethod,
        total,
        items: { create: [{ serviceName: "Corte (smoke)", priceCharged: total }] },
      },
    });
  }
}

// Registros del día que cierra el smoke (ayer) y del día abierto (hoy). Mismos montos en ambos.
//   Ana (NONE), Bruno (PERCENTAGE 50 %), Carla (FIXED_RENT $8000/día, factura menos que el alquiler).
const DAY_RECORDS: RecordSpec[] = [
  ["Ana", "CASH", "12000"],
  ["Ana", "TRANSFER", "0.10"],
  ["Bruno", "CASH", "0.20"],
  ["Bruno", "CARD", "18000"],
  ["Bruno", "OTHER", "1500.55"],
  ["Carla", "TRANSFER", "5000"],
];
const EXPECTED = {
  CASH: "12000.20",
  TRANSFER: "5000.10",
  CARD: "18000.00",
  OTHER: "1500.55",
  total: "36500.85",
  barbers: {
    // Ana NONE: 12000.10 → 0 / 12000.10
    Ana: { scheme: "NONE", schemeValue: "0.00", gross: "12000.10", barberAmount: "0.00", shopAmount: "12000.10" },
    // Bruno 50 % de 19500.75 = 9750.375 → 9750.38 (half-up)
    Bruno: { scheme: "PERCENTAGE", schemeValue: "50.00", gross: "19500.75", barberAmount: "9750.38", shopAmount: "9750.37" },
    // Carla alquiler 8000 con bruto 5000 → debe 3000
    Carla: { scheme: "FIXED_RENT", schemeValue: "8000.00", gross: "5000.00", barberAmount: "-3000.00", shopAmount: "8000.00" },
  } as Record<string, { scheme: string; schemeValue: string; gross: string; barberAmount: string; shopAmount: string }>,
  barberTotal: "6750.38",
  shopTotal: "29750.47",
};

async function seed() {
  await wipe(SLUG);
  await wipe(OTHER_SLUG);
  const passwordHash = await hashPassword(PASSWORD);

  const shop = await db.barbershop.create({
    data: {
      slug: SLUG,
      name: "Barbería Smoke 006",
      timezone: TZ,
      users: {
        create: [
          { email: "dueno@smoke-006.test", name: "Ana", passwordHash, role: "OWNER", payoutScheme: "NONE" },
          { email: "bruno@smoke-006.test", name: "Bruno", passwordHash, payoutScheme: "PERCENTAGE", payoutValue: "50" },
          { email: "carla@smoke-006.test", name: "Carla", passwordHash, payoutScheme: "FIXED_RENT", payoutValue: "8000" },
        ],
      },
    },
    include: { users: true },
  });
  const other = await db.barbershop.create({
    data: {
      slug: OTHER_SLUG,
      name: "Otra Barbería Smoke 006",
      timezone: TZ,
      users: {
        create: [
          { email: "dueno@smoke-006-other.test", name: "Otro Dueño", passwordHash, role: "OWNER" },
          { email: "otro@smoke-006-other.test", name: "Otro Barbero", passwordHash, payoutScheme: "PERCENTAGE", payoutValue: "40" },
        ],
      },
    },
    include: { users: true },
  });

  const ids = Object.fromEntries(shop.users.map((u) => [u.name, u.id]));
  const otherIds = Object.fromEntries(other.users.map((u) => [u.name, u.id]));

  const today = businessDate(new Date(), TZ);
  const closedDay = addDays(today, -1);
  const emptyDay = addDays(today, -2);
  // Varios días para repetir la carrera de cierres simultáneos (un solo intento no detecta flakiness).
  const raceDays = [3, 4, 5, 6, 7, 8].map((n) => addDays(today, -n));

  await insertRecords(shop.id, closedDay, ids, DAY_RECORDS);
  await insertRecords(shop.id, today, ids, DAY_RECORDS);
  for (const raceDay of raceDays) {
    await insertRecords(shop.id, raceDay, ids, [
      ["Bruno", "CASH", "1000"],
      ["Carla", "CARD", "2500.50"],
    ]);
  }
  // Mismo día, otra barbería: no debe aparecer ni cerrarse.
  for (const date of [closedDay, today]) {
    await insertRecords(other.id, date, otherIds, [
      ["Otro Barbero", "CASH", "9999"],
      ["Otro Barbero", "CARD", "777.77"],
    ]);
  }

  return { shop, other, ids, today, closedDay, emptyDay, raceDays };
}

function printDay(label: string, day: CashDay) {
  console.log(`\n${label} — ${day.date} (${day.status === "closed" ? "cerrada" : "abierta"}, ${day.recordCount} cortes)`);
  console.log(
    `  Efectivo ${money(day.totals.CASH)} · Transferencia ${money(day.totals.TRANSFER)} · Tarjeta ${money(day.totals.CARD)} · Otro ${money(day.totals.OTHER)} · Total ${money(day.totals.total)}`,
  );
  for (const b of day.barbers) {
    const debe = b.barberAmount.startsWith("-") ? "  ← Debe a la barbería" : "";
    console.log(
      `  ${b.name.padEnd(6)} ${b.scheme.padEnd(10)} ${b.schemeValue.padStart(8)} | facturó ${money(b.gross)} | le corresponde ${money(b.barberAmount)} | barbería ${money(b.shopAmount)}${debe}`,
    );
  }
  console.log(`  A pagar a barberos ${money(day.barberTotal)} · Queda para la barbería ${money(day.shopTotal)}`);
}

function matchesExpected(day: CashDay): boolean {
  if (
    day.totals.CASH !== EXPECTED.CASH ||
    day.totals.TRANSFER !== EXPECTED.TRANSFER ||
    day.totals.CARD !== EXPECTED.CARD ||
    day.totals.OTHER !== EXPECTED.OTHER ||
    day.totals.total !== EXPECTED.total ||
    day.barberTotal !== EXPECTED.barberTotal ||
    day.shopTotal !== EXPECTED.shopTotal
  ) {
    return false;
  }
  if (day.barbers.map((b) => b.name).join(",") !== "Ana,Bruno,Carla") return false;
  return day.barbers.every((b) => {
    const e = EXPECTED.barbers[b.name];
    return (
      e.scheme === b.scheme &&
      e.schemeValue === b.schemeValue &&
      e.gross === b.gross &&
      e.barberAmount === b.barberAmount &&
      e.shopAmount === b.shopAmount
    );
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("cash-smoke borra y recrea datos de prueba: no se corre con NODE_ENV=production.");
    return 1;
  }
  console.log("Cargando fixture…");
  const { shop, other, ids, today, closedDay, emptyDay, raceDays } = await seed();
  const owner = ids["Ana"];
  const base = { barbershopId: shop.id, userId: owner, timeZone: TZ };
  const otherRecordsSnapshot = async () =>
    db.serviceRecord.findMany({
      where: { barbershopId: other.id },
      select: { id: true, cashCloseId: true },
      orderBy: { id: "asc" },
    });

  console.log(`\nVista previa (${closedDay}, antes de cerrar)…`);
  const preview = await getCashDay(shop.id, closedDay);
  check(preview.status === "open", "el día está abierto");
  check(matchesExpected(preview), "totales por medio de pago y por barbero exactos");
  check(preview.recordCount === DAY_RECORDS.length, "no incluye registros de smoke-006-other");
  const carlaPreview = preview.barbers.find((b) => b.name === "Carla");
  check(carlaPreview?.barberAmount === "-3000.00", "Carla (FIXED_RENT) muestra −3000 (debe a la barbería)");

  console.log(`\nCierre de ${closedDay}…`);
  const otherBefore = await otherRecordsSnapshot();
  const result = await closeCashDay({ ...base, date: closedDay, notes: "Cierre del smoke" });
  check(result.ok, "closeCashDay devuelve ok");
  const closes = await db.cashRegisterClose.findMany({
    where: { barbershopId: shop.id, businessDate: dateColumn(closedDay) },
    include: { payouts: { include: { barber: { select: { name: true } } } } },
  });
  check(closes.length === 1, "se creó exactamente 1 CashRegisterClose");
  const close = closes[0];
  if (close) {
    check(
      close.totalCash.toFixed(2) === EXPECTED.CASH &&
        close.totalTransfer.toFixed(2) === EXPECTED.TRANSFER &&
        close.totalCard.toFixed(2) === EXPECTED.CARD &&
        close.totalOther.toFixed(2) === EXPECTED.OTHER &&
        close.total.toFixed(2) === EXPECTED.total,
      "totales del cierre correctos",
    );
    check(close.closedById === owner && close.notes === "Cierre del smoke", "closedById y notas guardados");
    check(close.payouts.length === 3, "un BarberPayout por barbero con registros");
    for (const p of close.payouts) {
      const e = EXPECTED.barbers[p.barber.name];
      check(
        p.scheme === e.scheme &&
          p.schemeValue.toFixed(2) === e.schemeValue &&
          p.grossAmount.toFixed(2) === e.gross &&
          p.barberAmount.toFixed(2) === e.barberAmount &&
          p.shopAmount.toFixed(2) === e.shopAmount,
        `BarberPayout de ${p.barber.name}: scheme/schemeValue copiados y montos correctos`,
      );
    }
    const linked = await db.serviceRecord.count({ where: { barbershopId: shop.id, cashCloseId: close.id } });
    const stillOpen = await db.serviceRecord.count({
      where: { barbershopId: shop.id, businessDate: dateColumn(closedDay), cashCloseId: null },
    });
    check(linked === DAY_RECORDS.length && stillOpen === 0, "todos los registros del día quedaron con cashCloseId");
    const todayLinked = await db.serviceRecord.count({
      where: { barbershopId: shop.id, businessDate: dateColumn(today), cashCloseId: { not: null } },
    });
    check(todayLinked === 0, "los registros de otros días no se tocaron");
  }
  const otherAfter = await otherRecordsSnapshot();
  check(
    JSON.stringify(otherBefore) === JSON.stringify(otherAfter) && otherAfter.every((r) => r.cashCloseId === null),
    "los registros de smoke-006-other no se tocaron",
  );
  check(
    (await db.cashRegisterClose.count({ where: { barbershopId: other.id } })) === 0,
    "smoke-006-other no tiene cierres",
  );

  console.log("\nSegundo cierre, snapshot y día vacío…");
  const closesBefore = await db.cashRegisterClose.count();
  const payoutsBefore = await db.barberPayout.count();
  const again = await closeCashDay({ ...base, date: closedDay, notes: null });
  check(!again.ok && again.error === CLOSE_ERRORS.alreadyClosed, `segundo cierre → "${CLOSE_ERRORS.alreadyClosed}"`);
  check(
    (await db.cashRegisterClose.count()) === closesBefore && (await db.barberPayout.count()) === payoutsBefore,
    "el segundo cierre no creó filas",
  );

  await db.user.update({ where: { id: ids["Carla"] }, data: { payoutValue: "9000" } });
  await db.user.update({ where: { id: ids["Bruno"] }, data: { payoutValue: "60" } });
  const closedView = await getCashDay(shop.id, closedDay);
  check(closedView.status === "closed", "el día cerrado se lee como cerrado");
  check(matchesExpected(closedView), "cambiar payoutValue después del cierre no altera el día cerrado (snapshot)");
  const todayChanged = await getCashDay(shop.id, today);
  check(
    todayChanged.status === "open" && todayChanged.barbers.find((b) => b.name === "Carla")?.barberAmount === "-4000.00",
    "la vista previa de un día abierto sí usa el acuerdo vigente",
  );
  await db.user.update({ where: { id: ids["Carla"] }, data: { payoutValue: "8000" } });
  await db.user.update({ where: { id: ids["Bruno"] }, data: { payoutValue: "50" } });

  const empty = await closeCashDay({ ...base, date: emptyDay, notes: null });
  check(!empty.ok && empty.error === CLOSE_ERRORS.empty, `día sin registros → "${CLOSE_ERRORS.empty}"`);
  const future = await closeCashDay({ ...base, date: addDays(today, 1), notes: null });
  check(!future.ok && future.error === CLOSE_ERRORS.futureDate, "día futuro → rechazado");
  const wrongTenant = await closeCashDay({ ...base, barbershopId: other.id, date: emptyDay, notes: null });
  check(!wrongTenant.ok, "otra barbería sin registros ese día → rechazado");
  check((await db.cashRegisterClose.count()) === closesBefore, "los rechazos no crearon cierres");

  console.log(`\nCierres concurrentes (${raceDays.length} días × 4 cierres simultáneos)…`);
  const races = await Promise.all(
    raceDays.map((date) => Promise.all([1, 2, 3, 4].map(() => closeCashDay({ ...base, date, notes: null })))),
  );
  check(
    races.every((race) => race.filter((r) => r.ok).length === 1),
    "en cada día gana exactamente uno de los cierres simultáneos",
  );
  const losers = races.flat().filter((r) => !r.ok);
  check(
    losers.length === raceDays.length * 3 && losers.every((r) => !r.ok && r.error === CLOSE_ERRORS.alreadyClosed),
    `los demás devuelven "${CLOSE_ERRORS.alreadyClosed}" (${losers.length} perdedores)`,
  );
  const raceCloses = await db.cashRegisterClose.findMany({
    where: { barbershopId: shop.id, businessDate: { in: raceDays.map(dateColumn) } },
    select: { total: true, _count: { select: { records: true, payouts: true } } },
  });
  check(
    raceCloses.length === raceDays.length &&
      raceCloses.every((c) => c.total.toFixed(2) === "3500.50" && c._count.records === 2 && c._count.payouts === 2),
    "queda un solo cierre completo por día (2 registros, 2 payouts, total $ 3500,50)",
  );

  printDay("Caja cerrada (ayer)", closedView);
  const todayView = await getCashDay(shop.id, today);
  check(todayView.status === "open" && matchesExpected(todayView), "hoy: vista previa abierta con los mismos totales");
  printDay("Caja abierta (hoy)", todayView);

  console.log(
    `\nDatos listos: entrá como dueno@smoke-006.test / ${PASSWORD} a /dashboard/cash (hoy ${today}) y /dashboard/cash?date=${closedDay} (cerrada).`,
  );
  if (failures.length > 0) {
    console.error(`\nFALLÓ (${failures.length}):\n- ${failures.join("\n- ")}`);
    return 1;
  }
  console.log("OK");
  return 0;
}

main()
  .then(async (code) => {
    await db.$disconnect();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
