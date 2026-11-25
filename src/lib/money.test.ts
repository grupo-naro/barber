import { describe, expect, it } from "vitest";
import { formatPrice } from "./money";

describe("formatPrice", () => {
  it("sin centavos cuando son cero, con dos cuando no", () => {
    expect(formatPrice("15000.00")).toBe("$15.000");
    expect(formatPrice("15000")).toBe("$15.000");
    expect(formatPrice("1500.5")).toBe("$1.500,50");
    expect(formatPrice("-18000.00")).toBe("-$18.000");
    expect(formatPrice("12345678901234.10")).toBe("$12.345.678.901.234,10");
  });

  it("cero y montos chicos", () => {
    expect(formatPrice("0.00")).toBe("$0");
    expect(formatPrice("0.05")).toBe("$0,05");
    expect(formatPrice("-0.50")).toBe("-$0,50");
    expect(formatPrice("999.00")).toBe("$999");
  });

  it("no pierde precisión con montos que no entran en un float", () => {
    expect(formatPrice("99999999999999999999.99")).toBe("$99.999.999.999.999.999.999,99");
  });
});
