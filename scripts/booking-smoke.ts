// Fixture + smoke test de la reserva pública por hora y de la asignación de barbero al completar.
//   pnpm exec tsx scripts/booking-smoke.ts
// Borra y recrea (idempotente) las barberías `smoke-004` y `smoke-004-other`, verifica
// `createPublicBooking` y `completeAppointmentRecord`, y deja los datos cargados para probar
// `/smoke-004` y el panel a mano.
import "dotenv/config";
import { db } from "@/lib/db";
import { addDays, weekdayOf, zonedTimeToUtc } from "@/lib/slots";
import { businessDate, localTime } from "@/lib/time";
import { createPublicBooking, type PublicBookingInput } from "@/server/booking";
import { getAvailableSlots, getOnlineServices, getPublicBarbershop } from "@/server/queries/booking";
import { barbershopSlugExists } from "@/server/queries/slug-exists";
import { completeAppointmentRecord, setTodayAppointmentStatus, type ShopContext } from "@/server/records";

const SLUG = "smoke-004";
const OTHER_SLUG = "smoke-004-other";
const TZ = "America/Argentina/Buenos_Aires";
const HOUR_MS = 60 * 60_000;

const failures: string[] = [];
function check(condition: boolean, label: string) {
  console.log(`${condition ? "  ✓" : "  ✗"} ${label}`);
  if (!condition) failures.push(label);
}

/** Próximo día hábil (lun–sáb) estrictamente posterior a `date`. */
function nextWorkingDay(date: string): string {
  let d = addDays(date, 1);
  while (weekdayOf(d) === 0) d = addDays(d, 1);
  return d;
}

async function wipe(slug: string) {
  const shop = await db.barbershop.findUnique({ where: { slug }, select: { id: true } });
  if (!shop) return;
  await db.serviceRecord.deleteMany({ where: { barbershopId: shop.id } });
  await db.cashRegisterClose.deleteMany({ where: { barbershopId: shop.id } });
  await db.appointment.deleteMany({ where: { barbershopId: shop.id } });
  await db.customer.deleteMany({ where: { barbershopId: shop.id } });
  await db.barbershop.delete({ where: { id: shop.id } });
}

async function seed() {
  await wipe(SLUG);
  await wipe(OTHER_SLUG);

  const shop = await db.barbershop.create({
    data: {
      slug: SLUG,
      name: "Barbería Smoke 004",
      description: "Cortes clásicos y modernos en el corazón de Palermo.",
      address: "Av. Siempreviva 742, CABA",
      phone: "+54 11 4000-0004",
      whatsapp: "5491140000004",
      timezone: TZ,
      openingHours: {
        create: Array.from({ length: 7 }, (_, weekday) =>
          weekday === 0
            ? { weekday, closed: true }
            : { weekday, opensAt: "09:00", closesAt: "19:00", closed: false },
        ),
      },
      users: {
        create: [
          { email: "ana@smoke-004.test", name: "Ana", passwordHash: "hash-secreto-ana", role: "OWNER", payoutScheme: "NONE" },
          { email: "bruno@smoke-004.test", name: "Bruno", passwordHash: "hash-secreto-bruno", payoutScheme: "PERCENTAGE", payoutValue: "50" },
          { email: "diego@smoke-004.test", name: "Diego", passwordHash: "hash-secreto-diego", payoutScheme: "PERCENTAGE", payoutValue: "50" },
          { email: "carlos@smoke-004.test", name: "Carlos Inactivo", active: false, payoutScheme: "FIXED_RENT", payoutValue: "30000" },
        ],
      },
      services: {
        create: [
          { name: "Corte", description: "Corte a tijera o máquina.", price: "12000", durationMinutes: 30, sortOrder: 1 },
          { name: "Corte y barba", description: "Corte completo más perfilado de barba.", price: "18000", durationMinutes: 45, sortOrder: 2 },
          { name: "Barba", description: "Perfilado y toalla caliente.", price: "8000", durationMinutes: 20, sortOrder: 3 },
          { name: "Servicio interno oculto", price: "1000", durationMinutes: 15, sortOrder: 4, showOnline: false },
        ],
      },
    },
    include: { users: true, services: true },
  });

  const other = await db.barbershop.create({
    data: {
      slug: OTHER_SLUG,
      name: "Otra Barbería Smoke",
      users: { create: [{ email: "otro@smoke-004-other.test", name: "Barbero Ajeno", payoutScheme: "NONE" }] },
      services: { create: [{ name: "Corte de la otra", price: "9999", durationMinutes: 30 }] },
    },
    include: { services: true, users: true },
  });

  const byName = (name: string) => shop.users.find((u) => u.name === name)!;
  const service = (name: string) => shop.services.find((s) => s.name === name)!;

  const today = businessDate(new Date(), TZ);
  const day1 = nextWorkingDay(today); // próximo día hábil: reservas del smoke + turnos fijos

  const fixtureCustomer = await db.customer.create({
    data: { barbershopId: shop.id, name: "Cliente Fixture", phone: "1199990000", notes: "2 al costado, tijera arriba" },
  });
  const corte = service("Corte");
  // Turno fijo a las 10:00 (sin barbero, como los de la web) y uno cancelado a las 11:00.
  for (const [time, status] of [["10:00", "CONFIRMED"], ["11:00", "CANCELLED"]] as const) {
    const startsAt = zonedTimeToUtc(day1, time, TZ);
    await db.appointment.create({
      data: {
        barbershopId: shop.id,
        customerId: fixtureCustomer.id,
        barberId: null,
        serviceId: corte.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + HOUR_MS),
        status,
      },
    });
  }

  return { shop, other, byName, service, today, day1, fixtureCustomer };
}

async function main() {
  console.log("Cargando fixture…");
  const { shop, other, byName, service, today, day1, fixtureCustomer } = await seed();
  const at = (date: string, time: string) => zonedTimeToUtc(date, time, TZ).toISOString();
  const countAppointments = () => db.appointment.count({ where: { barbershopId: { in: [shop.id, other.id] } } });
  const corte = service("Corte");
  const ana = byName("Ana");
  const bruno = byName("Bruno");
  const diego = byName("Diego");

  console.log(`Verificando getAvailableSlots (día ${day1})…`);
  const avail = await getAvailableSlots(SLUG, { serviceId: corte.id, date: day1, now: new Date() });
  const availTimes = (avail?.slots ?? []).map((s) => localTime(s, TZ));
  check(avail?.open === true, "el día hábil está abierto");
  check(
    availTimes.join(",") === "09:00,10:00,11:00,12:00,13:00,14:00,15:00,16:00,17:00,18:00",
    `sólo horas en punto 09:00…18:00 (hay ${availTimes.join(",")})`,
  );
  check(availTimes.includes("10:00"), "una hora que ya tiene turnos sigue apareciendo (10:00)");

  console.log(`Verificando createPublicBooking (día ${day1})…`);

  // (a) Reserva válida a las 10:00 → sin barbero, 60 min, PENDING; también con servicios de 20 y 45 min.
  const first = await createPublicBooking(SLUG, {
    name: "Juan Pérez",
    phone: "1123456789",
    serviceId: corte.id,
    startsAt: at(day1, "10:00"),
  });
  check(first.ok, "reserva a las 10:00 del próximo día hábil → ok");
  check(!("barberName" in first), "la respuesta no trae barberName");
  for (const [name, booking] of [
    ["Corte (30 min)", first],
    [
      "Barba (20 min)",
      await createPublicBooking(SLUG, { name: "Pedro Barba", phone: "1130000020", serviceId: service("Barba").id, startsAt: at(day1, "10:00") }),
    ],
    [
      "Corte y barba (45 min)",
      await createPublicBooking(SLUG, { name: "Pablo Completo", phone: "1130000045", serviceId: service("Corte y barba").id, startsAt: at(day1, "10:00") }),
    ],
  ] as const) {
    check(booking.ok, `${name}: reserva ok`);
    if (!booking.ok) continue;
    const appt = await db.appointment.findUniqueOrThrow({ where: { id: booking.appointmentId } });
    check(appt.barberId === null, `${name}: turno con barberId = null`);
    check(appt.endsAt.getTime() - appt.startsAt.getTime() === HOUR_MS, `${name}: endsAt − startsAt = 60 min`);
    check(appt.status === "PENDING" && appt.barbershopId === shop.id, `${name}: PENDING y de la barbería del slug`);
  }

  // (b) Tres reservas concurrentes a la misma hora → las tres ok.
  const before = await countAppointments();
  const race = await Promise.all(
    ["1160000001", "1160000002", "1160000003"].map((phone, i) =>
      createPublicBooking(SLUG, { name: `Concurrente ${i + 1}`, phone, serviceId: corte.id, startsAt: at(day1, "12:00") }),
    ),
  );
  check(race.every((r) => r.ok), "tres reservas concurrentes a la misma hora → las tres ok");
  check((await countAppointments()) === before + 3, "…y se crearon 3 turnos");

  // (c) Mismo teléfono y misma hora → rechazo; a otra hora → ok y reutiliza el Customer sin pisar notas.
  const beforeDup = await countAppointments();
  const dup = await createPublicBooking(SLUG, {
    name: "Juan Pérez",
    phone: "11 2345-6789",
    serviceId: corte.id,
    startsAt: at(day1, "10:00"),
  });
  check(!dup.ok, "mismo teléfono (otro formato) y misma hora → ok:false");
  const dupRace = await Promise.all(
    [0, 1].map(() =>
      createPublicBooking(SLUG, { name: "Doble Click", phone: "1162222222", serviceId: corte.id, startsAt: at(day1, "14:00") }),
    ),
  );
  check(dupRace.filter((r) => r.ok).length === 1, "doble envío concurrente del mismo teléfono → sólo uno ok");
  check((await countAppointments()) === beforeDup + 1, "…sin crear turnos de más");
  const samePhone = await createPublicBooking(SLUG, {
    name: "Juan Pérez",
    phone: "(11) 2345 6789",
    serviceId: corte.id,
    startsAt: at(day1, "11:00"),
  });
  check(samePhone.ok, "mismo teléfono a otra hora → ok");
  if (first.ok && samePhone.ok) {
    const [a, b] = await Promise.all([
      db.appointment.findUniqueOrThrow({ where: { id: first.appointmentId } }),
      db.appointment.findUniqueOrThrow({ where: { id: samePhone.appointmentId } }),
    ]);
    check(a.customerId === b.customerId, "…y reutiliza el mismo Customer");
  }
  const fixtureDup = await createPublicBooking(SLUG, {
    name: "Cliente Fixture",
    phone: "+11 9999-0000",
    serviceId: corte.id,
    startsAt: at(day1, "10:00"),
  });
  check(!fixtureDup.ok, "cliente con turno CONFIRMED a esa hora → ok:false");
  const fixtureBooking = await createPublicBooking(SLUG, {
    name: "Cliente Fixture",
    phone: "+11 9999-0000",
    serviceId: service("Barba").id,
    startsAt: at(day1, "15:00"),
  });
  const fixtureAfter = await db.customer.findUniqueOrThrow({ where: { id: fixtureCustomer.id } });
  check(
    fixtureBooking.ok && fixtureAfter.notes === "2 al costado, tijera arriba",
    "reserva de un cliente existente a otra hora → ok sin pisar sus notas",
  );
  check(
    (await db.customer.count({ where: { barbershopId: shop.id, phone: "1123456789" } })) === 1,
    "hay un único Customer con ese teléfono (normalizado a dígitos)",
  );

  // (d) Rechazos sin crear turnos ni clientes.
  const beforeInvalid = await countAppointments();
  const customersBefore = await db.customer.count();
  let sunday = day1;
  while (weekdayOf(sunday) !== 0) sunday = addDays(sunday, 1);
  const invalidCases: [string, Partial<PublicBookingInput>, Date?][] = [
    ["10:30 (fuera de la hora en punto)", { startsAt: at(day1, "10:30") }],
    ["10:15 (fuera de la hora en punto)", { startsAt: at(day1, "10:15") }],
    ["19:00 con cierre 19:00", { startsAt: at(day1, "19:00") }],
    ["08:00 antes de la apertura", { startsAt: at(day1, "08:00") }],
    ["domingo cerrado", { startsAt: at(sunday, "10:00") }],
    ["una hora ya pasada", { startsAt: at(day1, "12:00") }, new Date(at(day1, "13:30"))],
    ["un día ya pasado", { startsAt: at(addDays(day1, -7), "12:00") }],
    ["más allá de los 14 días", { startsAt: at(addDays(day1, 30), "12:00") }],
    ["servicio de otro tenant", { serviceId: other.services[0].id }],
    ["servicio con showOnline=false", { serviceId: service("Servicio interno oculto").id }],
    ["teléfono inválido", { phone: "12-34" }],
    ["nombre muy corto", { name: "J" }],
    ["fecha no ISO", { startsAt: "mañana a las 10" }],
  ];
  for (const [label, override, now] of invalidCases) {
    const result = await createPublicBooking(
      SLUG,
      { name: "Fuera De Horario", phone: "1171111111", serviceId: corte.id, startsAt: at(day1, "12:00"), ...override },
      now,
    );
    check(!result.ok, `${label} → ok:false`);
  }
  const crossSlug = await createPublicBooking(OTHER_SLUG, {
    name: "Intruso",
    phone: "1170000000",
    serviceId: corte.id,
    startsAt: at(day1, "12:00"),
  });
  check(!crossSlug.ok, "servicio de smoke-004 reservado vía smoke-004-other → ok:false");
  check((await countAppointments()) === beforeInvalid, "los rechazos no crearon turnos");
  check((await db.customer.count()) === customersBefore, "los rechazos no crearon clientes");

  // (d.2) Barbería SUSPENDED (job 018): ni reservas (aunque el POST llegue directo), ni slots, ni datos públicos.
  console.log("Verificando barbería suspendida…");
  await db.barbershop.update({ where: { id: shop.id }, data: { status: "SUSPENDED" } });
  const beforeSuspended = await countAppointments();
  const suspendedBooking = await createPublicBooking(SLUG, {
    name: "Cliente Suspendida",
    phone: "1175555555",
    serviceId: corte.id,
    startsAt: at(day1, "12:00"),
  });
  check(!suspendedBooking.ok, "barbería suspendida: createPublicBooking → ok:false");
  check((await countAppointments()) === beforeSuspended, "…y no se creó ningún turno");
  check(
    (await getAvailableSlots(SLUG, { serviceId: corte.id, date: day1, now: new Date() })) === null,
    "barbería suspendida: getAvailableSlots → null",
  );
  check((await getPublicBarbershop(SLUG)) === null, "barbería suspendida: getPublicBarbershop → null");
  check((await getOnlineServices(SLUG)).length === 0, "barbería suspendida: getOnlineServices → []");
  check(!(await barbershopSlugExists(SLUG)), "barbería suspendida: barbershopSlugExists → false (404)");
  await db.barbershop.update({ where: { id: shop.id }, data: { status: "ACTIVE" } });
  check((await barbershopSlugExists(SLUG)) && (await getPublicBarbershop(SLUG)) !== null, "reactivada: vuelve a resolverse");
  const reactivatedBooking = await createPublicBooking(SLUG, {
    name: "Cliente Reactivada",
    phone: "1175555556",
    serviceId: corte.id,
    startsAt: at(day1, "17:00"),
  });
  check(reactivatedBooking.ok, "reactivada: createPublicBooking → ok sin pasos manuales");

  // (e) Un barberId en el input se ignora: el turno queda sin asignar.
  for (const [label, barberId] of [
    ["de otro tenant", other.users[0].id],
    ["inexistente", "no-existe"],
    ["del propio tenant", bruno.id],
  ] as const) {
    const result = await createPublicBooking(SLUG, {
      name: "Con Barbero",
      phone: `117333${String(label.length).padStart(4, "0")}`,
      serviceId: corte.id,
      startsAt: at(day1, "16:00"),
      barberId,
    } as PublicBookingInput);
    check(result.ok, `barberId ${label} en el input → la reserva igual es ok`);
    if (result.ok) {
      const appt = await db.appointment.findUniqueOrThrow({ where: { id: result.appointmentId } });
      check(appt.barberId === null, `barberId ${label} en el input → el turno queda con barberId = null`);
    }
  }

  // Asignación al completar (turnos de HOY creados por DB, `now` controlado al mediodía).
  console.log(`Verificando completeAppointmentRecord (hoy ${today})…`);
  const now = zonedTimeToUtc(today, "12:00", TZ);
  const ctxOf = (userId: string, role: "OWNER" | "BARBER", barbershopId = shop.id): ShopContext => ({
    barbershopId,
    timeZone: TZ,
    actor: { userId, role },
    now,
  });
  const todayCustomer = await db.customer.create({
    data: { barbershopId: shop.id, name: "Cliente De Hoy", phone: "1188880000" },
  });
  async function todayAppointment(time: string, barberId: string | null) {
    const startsAt = zonedTimeToUtc(today, time, TZ);
    return db.appointment.create({
      data: {
        barbershopId: shop.id,
        customerId: todayCustomer.id,
        barberId,
        serviceId: corte.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + HOUR_MS),
        status: "PENDING",
      },
    });
  }
  const complete = (ctx: ShopContext, appointmentId: string, barberId?: string) =>
    completeAppointmentRecord(ctx, { appointmentId, paymentMethod: "CASH", serviceIds: [corte.id], barberId });
  const state = async (appointmentId: string) => {
    const appt = await db.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: { serviceRecord: true } });
    return { status: appt.status, barberId: appt.barberId, recordBarberId: appt.serviceRecord?.barberId ?? null, hasRecord: appt.serviceRecord !== null };
  };

  // BARBER completa un turno sin asignar → queda a su nombre.
  const unassigned = await todayAppointment("09:00", null);
  const r1 = await complete(ctxOf(bruno.id, "BARBER"), unassigned.id, "");
  const s1 = await state(unassigned.id);
  check(r1.ok && s1.status === "COMPLETED", "BARBER completa un turno sin asignar → ok");
  check(s1.barberId === bruno.id && s1.recordBarberId === bruno.id, "…Appointment.barberId y ServiceRecord.barberId = él");

  // BARBER mandando el id de otro → rechazo, el turno sigue abierto.
  const unassigned2 = await todayAppointment("10:00", null);
  const r2 = await complete(ctxOf(bruno.id, "BARBER"), unassigned2.id, diego.id);
  const s2 = await state(unassigned2.id);
  check(!r2.ok && s2.status === "PENDING" && s2.barberId === null && !s2.hasRecord, "BARBER con el id de otro → ok:false y el turno sigue abierto");

  // OWNER eligiendo a otro barbero activo → ambos quedan con ese barbero.
  const r3 = await complete(ctxOf(ana.id, "OWNER"), unassigned2.id, diego.id);
  const s3 = await state(unassigned2.id);
  check(r3.ok && s3.barberId === diego.id && s3.recordBarberId === diego.id, "OWNER elige a Diego → turno y registro con Diego");

  // OWNER sin elegir → él mismo.
  const unassigned3 = await todayAppointment("11:00", null);
  const r4 = await complete(ctxOf(ana.id, "OWNER"), unassigned3.id, "");
  const s4 = await state(unassigned3.id);
  check(r4.ok && s4.barberId === ana.id && s4.recordBarberId === ana.id, "OWNER sin elegir → queda a su nombre");

  // OWNER con barbero inactivo o de otra barbería → rechazo sin registro.
  const unassigned4 = await todayAppointment("11:00", null);
  for (const [label, barberId] of [
    ["inactivo", byName("Carlos Inactivo").id],
    ["de otra barbería", other.users[0].id],
    ["inexistente", "no-existe"],
  ] as const) {
    const r = await complete(ctxOf(ana.id, "OWNER"), unassigned4.id, barberId);
    const s = await state(unassigned4.id);
    check(!r.ok && s.status === "PENDING" && s.barberId === null && !s.hasRecord, `OWNER con barbero ${label} → ok:false sin registro`);
  }

  // Turno viejo ya asignado: el OWNER lo completa con el mismo barbero.
  const assignedToBruno = await todayAppointment("13:00", bruno.id);
  const r5 = await complete(ctxOf(ana.id, "OWNER"), assignedToBruno.id, bruno.id);
  const s5 = await state(assignedToBruno.id);
  check(r5.ok && s5.barberId === bruno.id && s5.recordBarberId === bruno.id, "OWNER completa un turno asignado a Bruno sin cambiarlo");

  // Un BARBER no puede completar ni cancelar un turno asignado a otro, pero sí uno sin asignar.
  const assignedToDiego = await todayAppointment("14:00", diego.id);
  const r6 = await complete(ctxOf(bruno.id, "BARBER"), assignedToDiego.id);
  const c6 = await setTodayAppointmentStatus(ctxOf(bruno.id, "BARBER"), assignedToDiego.id, "CANCELLED");
  const s6 = await state(assignedToDiego.id);
  check(!r6.ok && !c6.ok && s6.status === "PENDING" && !s6.hasRecord, "BARBER no completa ni cancela un turno de otro barbero");
  const unassigned5 = await todayAppointment("15:00", null);
  const c7 = await setTodayAppointmentStatus(ctxOf(bruno.id, "BARBER"), unassigned5.id, "CANCELLED");
  check(c7.ok && (await state(unassigned5.id)).status === "CANCELLED", "BARBER sí cancela un turno sin asignar");

  // Un OWNER de otra barbería no ve los turnos de esta.
  const unassigned6 = await todayAppointment("16:00", null);
  const r8 = await complete(ctxOf(other.users[0].id, "OWNER", other.id), unassigned6.id);
  check(!r8.ok && !(await state(unassigned6.id)).hasRecord, "un OWNER de otra barbería no puede completar el turno");

  console.log(`\nDatos listos: /${SLUG} (día con turnos: ${day1}).`);
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
