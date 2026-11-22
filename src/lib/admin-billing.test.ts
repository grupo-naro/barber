import { describe, expect, it } from "vitest";
import {
  amountField,
  cbuField,
  dateField,
  formatARS,
  generateLinkSchema,
  hasLivePreapproval,
  isFutureBusinessDate,
  manualPaidAtInstant,
  manualPaymentSchema,
  monthsField,
  platformSettingsSchema,
  setBillingEnabledSchema,
  whatsappField,
} from "@/lib/admin-billing";

describe("amountField", () => {
  it.each(["15000", "15000.5", "15000.50", "0.01", " 1200 "])("acepta %j", (value) => {
    expect(amountField.safeParse(value).success).toBe(true);
  });

  it.each(["0", "0.00", "-1", "15000.123", "abc", "", "15.000", "1e5", "1,5"])("rechaza %j", (value) => {
    expect(amountField.safeParse(value).success).toBe(false);
  });

  it("devuelve el string recortado, no un number", () => {
    expect(amountField.parse(" 15000.5 ")).toBe("15000.5");
  });
});

describe("monthsField", () => {
  it.each([
    ["1", 1],
    ["12", 12],
    ["6", 6],
    [3, 3],
  ])("acepta %j", (value, expected) => {
    expect(monthsField.parse(value)).toBe(expected);
  });

  it("vale 1 si falta o viene vacío", () => {
    expect(monthsField.parse(undefined)).toBe(1);
    expect(monthsField.parse(null)).toBe(1);
    expect(monthsField.parse("")).toBe(1);
    expect(manualPaymentSchema.parse({ id: "x", amount: "100", paidAt: "2027-01-01" }).months).toBe(1);
  });

  it.each(["0", "13", "1.5", 0, 13, 1.5, "abc"])("rechaza %j", (value) => {
    expect(monthsField.safeParse(value).success).toBe(false);
  });
});

describe("payerEmail", () => {
  it("acepta un mail válido y lo normaliza", () => {
    const parsed = generateLinkSchema.parse({ id: "x", amount: "15000", payerEmail: " Duenio@Example.com " });
    expect(parsed.payerEmail).toBe("duenio@example.com");
  });

  it.each(["", "no-es-mail", "a@", "@b.com"])("rechaza %j", (value) => {
    expect(generateLinkSchema.safeParse({ id: "x", amount: "15000", payerEmail: value }).success).toBe(false);
  });
});

describe("dateField (paidAt)", () => {
  it.each(["2027-03-10", "2028-02-29"])("acepta %j", (value) => {
    expect(dateField.safeParse(value).success).toBe(true);
  });

  it.each(["", "2027-02-30", "2027-13-01", "10/03/2027", "2027-3-1", "2027-02-29"])("rechaza %j", (value) => {
    expect(dateField.safeParse(value).success).toBe(false);
  });
});

describe("cbuField", () => {
  it("vacío o ausente → null", () => {
    expect(cbuField.parse(undefined)).toBeNull();
    expect(cbuField.parse("")).toBeNull();
    expect(cbuField.parse("   ")).toBeNull();
  });

  it("acepta 22 dígitos (con espacios que se quitan)", () => {
    expect(cbuField.parse("0000003100012345678901")).toBe("0000003100012345678901");
    expect(cbuField.parse("0000 0031 0001 2345 6789 01")).toBe("0000003100012345678901");
  });

  it.each(["123", "00000031000123456789012", "000000310001234567890a"])("rechaza %j", (value) => {
    expect(cbuField.safeParse(value).success).toBe(false);
  });
});

describe("platformSettingsSchema", () => {
  it("recorta y pasa los vacíos a null", () => {
    expect(
      platformSettingsSchema.parse({ transferAlias: "  barber.app  ", transferCbu: "", transferHolder: " ", contactWhatsapp: "" }),
    ).toEqual({ transferAlias: "barber.app", transferCbu: null, transferHolder: null, contactWhatsapp: null });
  });

  it("WhatsApp: dígitos, espacios, + y -", () => {
    expect(whatsappField.parse("+54 9 11 1234-5678")).toBe("+54 9 11 1234-5678");
    expect(whatsappField.safeParse("11 1234 abcd").success).toBe(false);
    expect(whatsappField.safeParse("+-").success).toBe(false);
  });
});

describe("setBillingEnabledSchema", () => {
  it("enabled y confirm como booleanos", () => {
    expect(setBillingEnabledSchema.parse({ id: "x", enabled: "1", confirm: "1" })).toEqual({ id: "x", enabled: true, confirm: true });
    expect(setBillingEnabledSchema.parse({ id: "x", enabled: "0" })).toEqual({ id: "x", enabled: false, confirm: false });
    expect(setBillingEnabledSchema.safeParse({ id: "x", enabled: "true" }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("hasLivePreapproval", () => {
    expect(hasLivePreapproval({ mpPreapprovalId: null, mpStatus: null })).toBe(false);
    expect(hasLivePreapproval({ mpPreapprovalId: "p", mpStatus: "cancelled" })).toBe(false);
    expect(hasLivePreapproval({ mpPreapprovalId: "p", mpStatus: "authorized" })).toBe(true);
    expect(hasLivePreapproval({ mpPreapprovalId: "p", mpStatus: "pending" })).toBe(true);
  });

  it("isFutureBusinessDate usa el día de negocio de la timezone", () => {
    // 11/03/2027 01:00Z = 10/03 22:00 en Buenos Aires.
    const now = new Date("2027-03-11T01:00:00Z");
    expect(isFutureBusinessDate("2027-03-10", now)).toBe(false);
    expect(isFutureBusinessDate("2027-03-11", now)).toBe(true);
    expect(isFutureBusinessDate("2027-03-09", now)).toBe(false);
  });

  it("manualPaidAtInstant: mediodía local", () => {
    expect(manualPaidAtInstant("2027-03-10").toISOString()).toBe("2027-03-10T15:00:00.000Z");
  });

  it("formatARS", () => {
    expect(formatARS("15000.5")).toMatch(/15\.000,50/);
    expect(formatARS(null)).toBe("—");
  });
});
