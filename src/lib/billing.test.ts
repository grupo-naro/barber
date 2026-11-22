import { describe, expect, it } from "vitest";
import {
  BILLING_GRACE_DAYS,
  DUPLICATE_WINDOW_DAYS,
  billingState,
  canUsePanel,
  extendPaidUntil,
  isPubliclyVisible,
  isSuspectedDuplicate,
  type BillingState,
} from "@/lib/billing";
import { planExpiresAtFromDate } from "@/lib/platform-admin";
import { businessDate } from "@/lib/time";

const TZ = "America/Argentina/Buenos_Aires";
const DAY_MS = 24 * 60 * 60 * 1000;

describe("constantes", () => {
  it("margen de 12 días y ventana de duplicados de 30", () => {
    expect(BILLING_GRACE_DAYS).toBe(12);
    expect(DUPLICATE_WINDOW_DAYS).toBe(30);
  });
});

describe("billingState", () => {
  const paidUntil = planExpiresAtFromDate("2027-03-15", TZ);

  it("cobro desactivado → EXEMPT aunque paidUntil sea null o esté vencido", () => {
    expect(billingState({ billingEnabled: false, paidUntil: null }, new Date())).toBe("EXEMPT");
    expect(
      billingState({ billingEnabled: false, paidUntil }, new Date(paidUntil.getTime() + 365 * DAY_MS)),
    ).toBe("EXEMPT");
  });

  it("cobro activado sin pagos → AWAITING_FIRST_PAYMENT", () => {
    expect(billingState({ billingEnabled: true, paidUntil: null }, new Date())).toBe("AWAITING_FIRST_PAYMENT");
  });

  it("antes o justo en paidUntil → PAID", () => {
    expect(billingState({ billingEnabled: true, paidUntil }, new Date(paidUntil.getTime() - DAY_MS))).toBe("PAID");
    expect(billingState({ billingEnabled: true, paidUntil }, new Date(paidUntil.getTime()))).toBe("PAID");
  });

  it("un ms después de paidUntil y hasta paidUntil + 12d → GRACE", () => {
    expect(billingState({ billingEnabled: true, paidUntil }, new Date(paidUntil.getTime() + 1))).toBe("GRACE");
    expect(billingState({ billingEnabled: true, paidUntil }, new Date(paidUntil.getTime() + 12 * DAY_MS))).toBe(
      "GRACE",
    );
  });

  it("paidUntil + 12d + 1ms → BLOCKED", () => {
    expect(
      billingState({ billingEnabled: true, paidUntil }, new Date(paidUntil.getTime() + 12 * DAY_MS + 1)),
    ).toBe("BLOCKED");
  });
});

describe("canUsePanel / isPubliclyVisible", () => {
  const table: [BillingState, boolean, boolean][] = [
    ["EXEMPT", true, true],
    ["AWAITING_FIRST_PAYMENT", false, false],
    ["PAID", true, true],
    ["GRACE", true, true],
    ["BLOCKED", false, true],
  ];
  it.each(table)("%s → panel %s, público %s", (state, panel, publicly) => {
    expect(canUsePanel(state)).toBe(panel);
    expect(isPubliclyVisible(state)).toBe(publicly);
  });
});

describe("extendPaidUntil", () => {
  const at = (iso: string) => new Date(iso);

  it("pago antes de vencer: suma desde paidUntil", () => {
    const paidUntil = planExpiresAtFromDate("2027-03-15", TZ);
    const result = extendPaidUntil(paidUntil, at("2027-03-10T15:00:00Z"), 1, TZ);
    expect(result).toEqual(planExpiresAtFromDate("2027-04-15", TZ));
  });

  it("pago tarde: suma desde paidAt", () => {
    const paidUntil = planExpiresAtFromDate("2027-03-15", TZ);
    const result = extendPaidUntil(paidUntil, at("2027-03-20T15:00:00Z"), 1, TZ);
    expect(result).toEqual(planExpiresAtFromDate("2027-04-20", TZ));
  });

  it("paidUntil null: suma desde paidAt", () => {
    const result = extendPaidUntil(null, at("2027-05-02T15:00:00Z"), 1, TZ);
    expect(result).toEqual(planExpiresAtFromDate("2027-06-02", TZ));
  });

  it("fin de mes: 2027-01-31 + 1 mes → 2027-02-28", () => {
    const result = extendPaidUntil(planExpiresAtFromDate("2027-01-31", TZ), at("2027-01-20T15:00:00Z"), 1, TZ);
    expect(result).toEqual(planExpiresAtFromDate("2027-02-28", TZ));
  });

  it("fin de mes en bisiesto: 2028-01-31 + 1 mes → 2028-02-29", () => {
    const result = extendPaidUntil(null, at("2028-01-31T15:00:00Z"), 1, TZ);
    expect(result).toEqual(planExpiresAtFromDate("2028-02-29", TZ));
  });

  it("months=3 suma 3 meses calendario (cruzando el año)", () => {
    const result = extendPaidUntil(planExpiresAtFromDate("2027-11-30", TZ), at("2027-11-01T15:00:00Z"), 3, TZ);
    expect(result).toEqual(planExpiresAtFromDate("2028-02-29", TZ));
    const plain = extendPaidUntil(null, at("2027-04-10T15:00:00Z"), 3, TZ);
    expect(plain).toEqual(planExpiresAtFromDate("2027-07-10", TZ));
  });

  it("usa el día de negocio: 22:30 en Argentina (ya el día siguiente en UTC)", () => {
    const paidAt = at("2027-03-11T01:30:00Z"); // 2027-03-10 22:30 en Buenos Aires
    expect(businessDate(paidAt, TZ)).toBe("2027-03-10");
    const result = extendPaidUntil(null, paidAt, 1, TZ);
    expect(result).toEqual(planExpiresAtFromDate("2027-04-10", TZ));
    expect(businessDate(result, TZ)).toBe("2027-04-10");
  });

  it("el resultado es el último ms del día local", () => {
    const result = extendPaidUntil(null, at("2027-05-02T15:00:00Z"), 1, TZ);
    expect(businessDate(result, TZ)).toBe("2027-06-02");
    expect(businessDate(new Date(result.getTime() + 1), TZ)).toBe("2027-06-03");
  });

  it("rechaza meses inválidos", () => {
    expect(() => extendPaidUntil(null, new Date(), 0, TZ)).toThrow();
    expect(() => extendPaidUntil(null, new Date(), 1.5, TZ)).toThrow();
  });
});

describe("isSuspectedDuplicate", () => {
  const paidAt = new Date("2027-03-10T15:00:00Z");
  const future = new Date(paidAt.getTime() + 20 * DAY_MS);
  const recentManual = new Date(paidAt.getTime() - 5 * DAY_MS);

  it("MP con período vigente y manual reciente → true", () => {
    expect(
      isSuspectedDuplicate({ source: "MERCADOPAGO", paidUntilBefore: future, paidAt, lastManualPaidAt: recentManual }),
    ).toBe(true);
  });

  it("manual justo a 30 días → true; a 31 días → false", () => {
    const at30 = new Date(paidAt.getTime() - 30 * DAY_MS);
    const at31 = new Date(paidAt.getTime() - 31 * DAY_MS);
    expect(isSuspectedDuplicate({ source: "MERCADOPAGO", paidUntilBefore: future, paidAt, lastManualPaidAt: at30 })).toBe(
      true,
    );
    expect(isSuspectedDuplicate({ source: "MERCADOPAGO", paidUntilBefore: future, paidAt, lastManualPaidAt: at31 })).toBe(
      false,
    );
  });

  it("sin pago manual → false", () => {
    expect(isSuspectedDuplicate({ source: "MERCADOPAGO", paidUntilBefore: future, paidAt, lastManualPaidAt: null })).toBe(
      false,
    );
  });

  it("período ya vencido (o justo en paidAt) o null → false", () => {
    const past = new Date(paidAt.getTime() - DAY_MS);
    for (const paidUntilBefore of [past, new Date(paidAt.getTime()), null]) {
      expect(
        isSuspectedDuplicate({ source: "MERCADOPAGO", paidUntilBefore, paidAt, lastManualPaidAt: recentManual }),
      ).toBe(false);
    }
  });

  it("un pago MANUAL siempre false", () => {
    expect(
      isSuspectedDuplicate({ source: "MANUAL", paidUntilBefore: future, paidAt, lastManualPaidAt: recentManual }),
    ).toBe(false);
  });
});
