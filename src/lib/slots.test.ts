import { describe, expect, it } from "vitest";
import {
  addDays,
  bookableDates,
  computeHourlySlots,
  isOpenDay,
  isValidDate,
  SLOT_MINUTES,
  validRanges,
  weekdayOf,
  zonedTimeToUtc,
} from "./slots";
import { localTime } from "./time";

const TZ = "America/Argentina/Buenos_Aires";
const DATE = "2026-03-10"; // martes
const HOURS = [{ opensAt: "10:00", closesAt: "20:00", closed: false }];
const EARLY = new Date("2026-03-01T00:00:00Z");

const at = (time: string) => zonedTimeToUtc(DATE, time, TZ);
const times = (slots: Date[]) => slots.map((s) => localTime(s, TZ));
const base = { date: DATE, timeZone: TZ, now: EARLY };
const range = (opensAt: string, closesAt: string) => ({ opensAt, closesAt, closed: false });
const hours = (opensAt: string, closesAt: string) => [range(opensAt, closesAt)];
const SPLIT = [range("10:00", "14:00"), range("17:00", "21:00")];

describe("zonedTimeToUtc", () => {
  it("09:00 en Buenos Aires es 12:00Z", () => {
    expect(zonedTimeToUtc(DATE, "09:00", TZ).toISOString()).toBe("2026-03-10T12:00:00.000Z");
  });

  it("cruza el borde del día: 22:30 local es 01:30Z del día siguiente", () => {
    expect(zonedTimeToUtc("2026-03-09", "22:30", TZ).toISOString()).toBe("2026-03-10T01:30:00.000Z");
  });

  it("usa la timezone y no un offset fijo (Madrid con horario de verano)", () => {
    expect(zonedTimeToUtc("2026-01-15", "10:00", "Europe/Madrid").toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-15", "10:00", "Europe/Madrid").toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });
});

describe("helpers de fecha", () => {
  it("weekdayOf, addDays e isValidDate", () => {
    expect(weekdayOf("2026-03-08")).toBe(0); // domingo
    expect(weekdayOf(DATE)).toBe(2);
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-02-28")).toBe(true);
    const dates = bookableDates("2026-12-25");
    expect(dates).toHaveLength(15);
    expect(dates[0]).toBe("2026-12-25");
    expect(dates.at(-1)).toBe("2027-01-08");
  });
});

describe("computeHourlySlots", () => {
  it("(a) día cerrado, sin horario o cierre <= apertura → []", () => {
    expect(computeHourlySlots({ ...base, hours: [{ opensAt: "10:00", closesAt: "20:00", closed: true }] })).toEqual([]);
    expect(computeHourlySlots({ ...base, hours: null })).toEqual([]);
    expect(computeHourlySlots({ ...base, hours: undefined })).toEqual([]);
    expect(computeHourlySlots({ ...base, hours: [] })).toEqual([]);
    expect(computeHourlySlots({ ...base, hours: [{ opensAt: null, closesAt: null, closed: false }] })).toEqual([]);
    expect(computeHourlySlots({ ...base, hours: hours("12:00", "12:00") })).toEqual([]);
    expect(computeHourlySlots({ ...base, hours: hours("14:00", "10:00") })).toEqual([]);
    expect(computeHourlySlots({ ...base, date: "2026-02-30", hours: HOURS })).toEqual([]);
  });

  it("(b) 10:00–20:00 en Buenos Aires → 10 slots de 10:00 (13:00Z) a 19:00", () => {
    const slots = computeHourlySlots({ ...base, hours: HOURS });
    expect(slots).toHaveLength(10);
    expect(slots[0].toISOString()).toBe("2026-03-10T13:00:00.000Z");
    expect(times(slots)[0]).toBe("10:00");
    expect(times(slots).at(-1)).toBe("19:00");
    expect(times(slots).every((t) => t.endsWith(":00"))).toBe(true);
    expect(SLOT_MINUTES).toBe(60);
  });

  it("(c) sólo horas en punto que entran completas en el horario", () => {
    expect(times(computeHourlySlots({ ...base, hours: hours("09:30", "12:00") }))).toEqual(["10:00", "11:00"]);
    expect(computeHourlySlots({ ...base, hours: hours("09:00", "09:45") })).toEqual([]);
    expect(times(computeHourlySlots({ ...base, hours: hours("09:00", "19:00") })).at(-1)).toBe("18:00");
  });

  it("(d) con now = 10:58 el primero es 11:00; con now = 11:00 exacto ya no", () => {
    expect(times(computeHourlySlots({ ...base, now: at("10:58"), hours: HOURS }))[0]).toBe("11:00");
    expect(times(computeHourlySlots({ ...base, now: at("11:00"), hours: HOURS }))[0]).toBe("12:00");
  });

  it("(e) no recibe turnos ni duración: siempre la misma grilla", () => {
    const input = { ...base, hours: HOURS };
    // Campos extra (turnos, duración) no existen en el input y no cambian nada.
    const withExtras = { ...input, appointments: [{ startsAt: at("10:00"), endsAt: at("11:00") }], durationMinutes: 45 };
    expect(computeHourlySlots(withExtras)).toEqual(computeHourlySlots(input));
  });

  it("(f) horario cortado 10–14 + 17–21 → sólo las horas de las dos franjas", () => {
    expect(times(computeHourlySlots({ ...base, hours: SPLIT }))).toEqual([
      "10:00", "11:00", "12:00", "13:00", "17:00", "18:00", "19:00", "20:00",
    ]);
  });

  it("(g) horario cortado con now: 10:58 arranca en 11:00; 15:00 (en el hueco) → 17 a 20", () => {
    expect(times(computeHourlySlots({ ...base, now: at("10:58"), hours: SPLIT }))).toEqual([
      "11:00", "12:00", "13:00", "17:00", "18:00", "19:00", "20:00",
    ]);
    expect(times(computeHourlySlots({ ...base, now: at("15:00"), hours: SPLIT }))).toEqual([
      "17:00", "18:00", "19:00", "20:00",
    ]);
  });

  it("(h) franjas desordenadas dan el mismo resultado; filas cerradas o incompletas se ignoran", () => {
    const reversed = [...SPLIT].reverse();
    expect(computeHourlySlots({ ...base, hours: reversed })).toEqual(computeHourlySlots({ ...base, hours: SPLIT }));
    const withJunk = [
      { opensAt: "14:00", closesAt: "17:00", closed: true },
      SPLIT[1],
      { opensAt: null, closesAt: "16:00", closed: false },
      { opensAt: "15:00", closesAt: "15:00", closed: false },
      { opensAt: "9:00", closesAt: "16:00", closed: false },
      SPLIT[0],
    ];
    expect(computeHourlySlots({ ...base, hours: withJunk })).toEqual(computeHourlySlots({ ...base, hours: SPLIT }));
  });

  it("(i) franjas que se tocan o pisan no duplican horas", () => {
    const slots = computeHourlySlots({ ...base, hours: [range("10:00", "14:00"), range("13:00", "16:00")] });
    expect(times(slots)).toEqual(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]);
  });
});

describe("validRanges / isOpenDay", () => {
  it("ordena las franjas válidas por apertura e ignora el resto", () => {
    expect(validRanges([range("17:00", "21:00"), { opensAt: "08:00", closesAt: "09:00", closed: true }, range("10:00", "14:00")])).toEqual([
      { open: 600, close: 840 },
      { open: 1020, close: 1260 },
    ]);
    expect(isOpenDay(SPLIT)).toBe(true);
    expect(isOpenDay([{ opensAt: null, closesAt: null, closed: true }])).toBe(false);
    expect(isOpenDay(null)).toBe(false);
  });
});
