import { describe, expect, it } from "vitest";
import { centsToDecimal, computePayout, decimalToCents, summarizeDay, type DayBarber, type DayRecord } from "./payouts";

// Los montos se pasan como string o bigint: nunca `number` para dinero.
function payout(scheme: "PERCENTAGE" | "FIXED_RENT" | "NONE", value: string, gross: string) {
  const { barberCents, shopCents } = computePayout({ scheme, value, grossCents: decimalToCents(gross) });
  return { barber: centsToDecimal(barberCents), shop: centsToDecimal(shopCents), barberCents, shopCents };
}

describe("decimalToCents / centsToDecimal", () => {
  it("convierte ida y vuelta, con signo", () => {
    expect(decimalToCents("10000")).toBe(BigInt(1_000_000));
    expect(decimalToCents("100.01")).toBe(BigInt(10_001));
    expect(decimalToCents("0.1")).toBe(BigInt(10));
    expect(decimalToCents("-3000.5")).toBe(BigInt(-300_050));
    expect(centsToDecimal(BigInt(-300_000))).toBe("-3000.00");
    expect(centsToDecimal(BigInt(5))).toBe("0.05");
  });

  it("rechaza montos inválidos", () => {
    expect(() => decimalToCents("1.234")).toThrow();
    expect(() => decimalToCents("abc")).toThrow();
    expect(() => decimalToCents("1,5")).toThrow();
  });
});

describe("computePayout", () => {
  it("PERCENTAGE 50 % de $10.000 → 5000 / 5000", () => {
    expect(payout("PERCENTAGE", "50", "10000")).toMatchObject({ barber: "5000.00", shop: "5000.00" });
  });

  it("PERCENTAGE 33.33 % de $100,01 → redondeo a centavos y suma exacta", () => {
    const r = payout("PERCENTAGE", "33.33", "100.01");
    // 100.01 × 33.33 / 100 = 33.333333 → 33.33
    expect(r).toMatchObject({ barber: "33.33", shop: "66.68" });
    expect(r.barberCents + r.shopCents).toBe(decimalToCents("100.01"));
  });

  it("PERCENTAGE redondea mitades hacia arriba", () => {
    // 50 % de $0,01 = 0,005 → 0,01
    expect(payout("PERCENTAGE", "50", "0.01")).toMatchObject({ barber: "0.01", shop: "0.00" });
    // 50 % de $0,03 = 0,015 → 0,02
    expect(payout("PERCENTAGE", "50", "0.03")).toMatchObject({ barber: "0.02", shop: "0.01" });
    // 33.33 % de $0,15 = 0,049995 → 0,05
    expect(payout("PERCENTAGE", "33.33", "0.15")).toMatchObject({ barber: "0.05", shop: "0.10" });
  });

  it("PERCENTAGE 0 % y 100 %", () => {
    expect(payout("PERCENTAGE", "0", "12345.67")).toMatchObject({ barber: "0.00", shop: "12345.67" });
    expect(payout("PERCENTAGE", "100", "12345.67")).toMatchObject({ barber: "12345.67", shop: "0.00" });
  });

  it("NONE → todo para la barbería", () => {
    expect(payout("NONE", "0", "20000")).toMatchObject({ barber: "0.00", shop: "20000.00" });
    expect(payout("NONE", "40", "20000")).toMatchObject({ barber: "0.00", shop: "20000.00" });
  });

  it("FIXED_RENT 8000: con bruto 20000 → 12000 / 8000; con bruto 5000 → −3000 / 8000", () => {
    expect(payout("FIXED_RENT", "8000", "20000")).toMatchObject({ barber: "12000.00", shop: "8000.00" });
    expect(payout("FIXED_RENT", "8000", "5000")).toMatchObject({ barber: "-3000.00", shop: "8000.00" });
  });

  it("acepta el Decimal de Prisma (cualquier objeto con toString)", () => {
    const decimal = { toString: () => "25" };
    expect(computePayout({ scheme: "PERCENTAGE", value: decimal, grossCents: BigInt(400_000) })).toEqual({
      barberCents: BigInt(100_000),
      shopCents: BigInt(300_000),
    });
  });

  it("barber + shop === gross para muchos casos", () => {
    for (const value of ["0", "0.01", "12.5", "33.33", "49.99", "66.67", "99.99", "100"]) {
      for (const gross of ["0", "0.01", "0.99", "1.01", "100.01", "999.99", "123456.78"]) {
        const r = payout("PERCENTAGE", value, gross);
        expect(r.barberCents + r.shopCents).toBe(decimalToCents(gross));
      }
    }
  });
});

describe("summarizeDay", () => {
  const barbers: DayBarber[] = [
    { id: "b-zoe", name: "Zoe", payoutScheme: "FIXED_RENT", payoutValue: "8000" },
    { id: "b-ana", name: "Ana", payoutScheme: "PERCENTAGE", payoutValue: "50" },
    { id: "b-sin", name: "Sin registros", payoutScheme: "FIXED_RENT", payoutValue: "8000" },
  ];
  const records: DayRecord[] = [
    { barberId: "b-ana", paymentMethod: "CASH", total: "0.10" },
    { barberId: "b-ana", paymentMethod: "CASH", total: "0.20" },
    { barberId: "b-ana", paymentMethod: "TRANSFER", total: "12000" },
    { barberId: "b-zoe", paymentMethod: "CARD", total: "3000.33" },
    { barberId: "b-zoe", paymentMethod: "OTHER", total: "1999.67" },
    { barberId: "b-ana", paymentMethod: "CARD", total: "100.01" },
  ];

  it("totales por medio de pago y total general exactos (0.10 + 0.20 = 0.30)", () => {
    const day = summarizeDay(records, barbers);
    expect(centsToDecimal(day.byMethod.CASH)).toBe("0.30");
    expect(centsToDecimal(day.byMethod.TRANSFER)).toBe("12000.00");
    expect(centsToDecimal(day.byMethod.CARD)).toBe("3100.34");
    expect(centsToDecimal(day.byMethod.OTHER)).toBe("1999.67");
    expect(centsToDecimal(day.totalCents)).toBe("17100.31");
    expect(day.recordCount).toBe(6);
  });

  it("bruto por barbero, ordenados por nombre, sin barberos sin registros", () => {
    const day = summarizeDay(records, barbers);
    expect(day.barbers.map((b) => b.name)).toEqual(["Ana", "Zoe"]);
    const [ana, zoe] = day.barbers;
    expect(centsToDecimal(ana.grossCents)).toBe("12100.31");
    expect(ana.recordCount).toBe(4);
    expect(ana.value).toBe("50.00");
    // 50 % de 12100.31 = 6050.155 → 6050.16 (half-up)
    expect(centsToDecimal(ana.barberCents)).toBe("6050.16");
    expect(centsToDecimal(ana.shopCents)).toBe("6050.15");
    expect(centsToDecimal(zoe.grossCents)).toBe("5000.00");
    expect(centsToDecimal(zoe.barberCents)).toBe("-3000.00");
    expect(centsToDecimal(zoe.shopCents)).toBe("8000.00");
  });

  it("la suma de barber + shop de todos los barberos es el total general", () => {
    const day = summarizeDay(records, barbers);
    const sum = day.barbers.reduce((acc, b) => acc + b.barberCents + b.shopCents, BigInt(0));
    expect(sum).toBe(day.totalCents);
    expect(day.barberTotalCents + day.shopTotalCents).toBe(day.totalCents);
    expect(centsToDecimal(day.barberTotalCents)).toBe("3050.16");
    expect(centsToDecimal(day.shopTotalCents)).toBe("14050.15");
  });

  it("día sin registros → todo en cero", () => {
    const day = summarizeDay([], barbers);
    expect(day.totalCents).toBe(BigInt(0));
    expect(day.barbers).toEqual([]);
    expect(day.recordCount).toBe(0);
  });

  it("lanza si un registro es de un barbero desconocido", () => {
    expect(() => summarizeDay([{ barberId: "otro", paymentMethod: "CASH", total: "1" }], barbers)).toThrow();
  });
});
