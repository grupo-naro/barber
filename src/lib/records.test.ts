import { describe, expect, it } from "vitest";
import {
  businessDateToDb,
  dayBoundsUtc,
  isUniqueViolation,
  nextDailyNumber,
  normalizeNotes,
  normalizePhone,
  resolveCompletingBarber,
  sumPrices,
} from "./records";

describe("dayBoundsUtc", () => {
  it("el día de negocio en Buenos Aires va de 03:00 UTC a 03:00 UTC del día siguiente", () => {
    const [start, end] = dayBoundsUtc("2026-11-20", "America/Argentina/Buenos_Aires");
    expect(start.toISOString()).toBe("2026-11-20T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-21T03:00:00.000Z");
  });

  it("cruza fin de mes y de año", () => {
    const [start, end] = dayBoundsUtc("2026-12-31", "America/Argentina/Buenos_Aires");
    expect(start.toISOString()).toBe("2026-12-31T03:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });

  it("rechaza fechas inválidas", () => {
    expect(() => dayBoundsUtc("2026-02-30")).toThrow();
  });
});

describe("businessDateToDb", () => {
  it("devuelve la medianoche UTC del día", () => {
    expect(businessDateToDb("2026-11-20").toISOString()).toBe("2026-11-20T00:00:00.000Z");
  });

  it("rechaza fechas inválidas", () => {
    expect(() => businessDateToDb("20-11-2026")).toThrow();
  });
});

describe("nextDailyNumber", () => {
  it("arranca en 1 y suma de a uno", () => {
    expect(nextDailyNumber(null)).toBe(1);
    expect(nextDailyNumber(undefined)).toBe(1);
    expect(nextDailyNumber(7)).toBe(8);
  });
});

describe("sumPrices", () => {
  it("suma en centavos, sin error de float", () => {
    expect(sumPrices(["100.10", "100.10", "100.10"])).toBe("300.30");
    expect(sumPrices(["0.1", "0.2"])).toBe("0.30");
  });

  it("acepta objetos con toString (Decimal) y lista vacía", () => {
    expect(sumPrices([{ toString: () => "12000" }, "500.5"])).toBe("12500.50");
    expect(sumPrices([])).toBe("0.00");
  });
});

describe("normalizePhone", () => {
  it("deja sólo dígitos", () => {
    expect(normalizePhone("+54 9 11 2345-6789")).toBe("5491123456789");
    expect(normalizePhone("1123456789")).toBe("1123456789");
  });

  it("rechaza menos de 8 o más de 15 dígitos", () => {
    expect(normalizePhone("1234567")).toBeNull();
    expect(normalizePhone("12345678")).toBe("12345678");
    expect(normalizePhone("123456789012345")).toBe("123456789012345");
    expect(normalizePhone("1234567890123456")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("normalizeNotes", () => {
  it("vacío o sólo espacios → null", () => {
    expect(normalizeNotes("")).toBeNull();
    expect(normalizeNotes("   \n ")).toBeNull();
    expect(normalizeNotes("  2 al costado  ")).toBe("2 al costado");
  });
});

describe("isUniqueViolation", () => {
  it("detecta el código P2002 de Prisma", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error("dup"), { code: "P2002" }))).toBe(true);
  });

  it("ignora otros errores", () => {
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("P2002")).toBe(false);
  });
});

describe("resolveCompletingBarber", () => {
  const barber = { userId: "b1", role: "BARBER" } as const;
  const owner = { userId: "o1", role: "OWNER" } as const;

  it("BARBER sin id o con su propio id → él", () => {
    expect(resolveCompletingBarber(barber, "")).toEqual({ ok: true, barberId: "b1" });
    expect(resolveCompletingBarber(barber, null)).toEqual({ ok: true, barberId: "b1" });
    expect(resolveCompletingBarber(barber, undefined)).toEqual({ ok: true, barberId: "b1" });
    expect(resolveCompletingBarber(barber, "b1")).toEqual({ ok: true, barberId: "b1" });
  });

  it("BARBER con el id de otro → error", () => {
    expect(resolveCompletingBarber(barber, "b2")).toEqual({
      ok: false,
      error: "Sólo podés completar turnos a tu nombre.",
    });
  });

  it("OWNER con id → ese id; vacío/null → él mismo", () => {
    expect(resolveCompletingBarber(owner, "b2")).toEqual({ ok: true, barberId: "b2" });
    expect(resolveCompletingBarber(owner, "")).toEqual({ ok: true, barberId: "o1" });
    expect(resolveCompletingBarber(owner, null)).toEqual({ ok: true, barberId: "o1" });
  });
});
