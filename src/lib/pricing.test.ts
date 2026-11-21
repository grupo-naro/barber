import { describe, expect, it } from "vitest";
import {
  adjustmentError,
  calculateNewPrice,
  calculateNewPriceCents,
  centsToPrice,
  exceedsMaxPrice,
  isValidPrice,
  normalizePrice,
  priceToCents,
} from "./pricing";

describe("calculateNewPrice", () => {
  it("porcentaje sin redondeo", () => {
    expect(calculateNewPrice("12000", "percent", 10, "none")).toBe("13200.00");
    expect(calculateNewPrice("12000.00", "percent", "10", "none")).toBe("13200.00");
  });

  it("porcentaje con redondeo a $500", () => {
    expect(calculateNewPrice("12000", "percent", 10, "500")).toBe("13000.00"); // 13200 → 13000
  });

  it("porcentaje decimal con redondeo a $1000 (mitad hacia arriba)", () => {
    expect(calculateNewPrice("12000", "percent", 12.5, "1000")).toBe("14000.00"); // 13500 → 14000
    expect(calculateNewPrice("12000", "percent", "12,5", "1000")).toBe("14000.00");
  });

  it("ajuste 0 sólo redondea, mitades hacia arriba", () => {
    expect(calculateNewPrice("7250", "percent", 0, "500")).toBe("7500.00");
    expect(calculateNewPrice("7249.99", "fixed", 0, "500")).toBe("7000.00");
  });

  it("sin error de float sobre varios servicios", () => {
    const prices = ["100.10", "100.10", "100.10"];
    const result = prices.map((p) => calculateNewPrice(p, "percent", 10, "none"));
    expect(result).toEqual(["110.11", "110.11", "110.11"]);
    const total = result.reduce((acc, p) => acc + priceToCents(p), BigInt(0));
    expect(centsToPrice(total)).toBe("330.33");
  });

  it("redondea al centavo con mitades hacia arriba", () => {
    expect(calculateNewPrice("0.05", "percent", 50, "none")).toBe("0.08"); // 7.5 centavos → 8
    expect(calculateNewPrice("100.01", "percent", 33.3333, "none")).toBe("133.35");
  });

  it("monto fijo", () => {
    expect(calculateNewPrice("12000", "fixed", 1500, "none")).toBe("13500.00");
    expect(calculateNewPrice("12000", "fixed", "+1500", "1000")).toBe("14000.00");
    expect(calculateNewPrice("12000.50", "fixed", "-0.50", "none")).toBe("12000.00");
  });

  it("descuento porcentual", () => {
    expect(calculateNewPrice("12000", "percent", -10, "none")).toBe("10800.00");
    expect(calculateNewPrice("12000", "percent", -100, "none")).toBe("0.00");
  });

  it("nunca baja de 0", () => {
    expect(calculateNewPrice("1000", "fixed", -1500, "none")).toBe("0.00");
    expect(calculateNewPrice("1000", "fixed", -1500, "500")).toBe("0.00");
  });

  it("acepta un objeto tipo Decimal (toString)", () => {
    expect(calculateNewPrice({ toString: () => "8000" }, "percent", 5, "none")).toBe("8400.00");
  });

  it("rechaza valores inválidos", () => {
    expect(() => calculateNewPrice("12000", "percent", "abc", "none")).toThrow();
    expect(() => calculateNewPrice("12000", "percent", -101, "none")).toThrow();
    expect(() => calculateNewPrice("12000", "percent", 1001, "none")).toThrow();
    expect(() => calculateNewPrice("12000", "fixed", "1.234", "none")).toThrow();
    expect(() => calculateNewPrice("-5", "fixed", 1, "none")).toThrow();
    expect(() => calculateNewPrice("12000", "percent", 1e21, "none")).toThrow();
  });
});

describe("validaciones", () => {
  it("adjustmentError", () => {
    expect(adjustmentError("percent", "10")).toBeNull();
    expect(adjustmentError("percent", "-10,5")).toBeNull();
    expect(adjustmentError("percent", "")).toMatch(/valor/);
    expect(adjustmentError("percent", "1000.0001")).toMatch(/entre/);
    expect(adjustmentError("fixed", "-500")).toBeNull();
    expect(adjustmentError("fixed", "10.555")).not.toBeNull();
  });

  it("isValidPrice / normalizePrice", () => {
    expect(isValidPrice("12000")).toBe(true);
    expect(isValidPrice("12000,5")).toBe(true);
    expect(isValidPrice("0")).toBe(true);
    expect(isValidPrice("9999999999.99")).toBe(true);
    expect(isValidPrice("-1")).toBe(false);
    expect(isValidPrice("12.000,00")).toBe(false);
    expect(isValidPrice("1.234")).toBe(false);
    expect(isValidPrice("1e3")).toBe(false);
    expect(isValidPrice("")).toBe(false);
    expect(normalizePrice("12000,5")).toBe("12000.50");
    expect(normalizePrice("0.1")).toBe("0.10");
  });
});

describe("calculateNewPriceCents / exceedsMaxPrice", () => {
  it("permite detectar precios que no entran en la columna", () => {
    const cents = calculateNewPriceCents("37000", "fixed", "9999990000", "none");
    expect(cents).toBe(BigInt(1_000_002_700_000));
    expect(exceedsMaxPrice(cents)).toBe(true);
    expect(exceedsMaxPrice(calculateNewPriceCents("37000", "fixed", "1500", "none"))).toBe(false);
  });
});
