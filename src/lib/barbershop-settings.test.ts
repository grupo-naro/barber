import { describe, expect, it } from "vitest";
import {
  normalizeDecimal,
  openingHoursErrors,
  openingHoursSchema,
  profileSchema,
  type OpeningHoursInput,
} from "./barbershop-settings";

describe("profileSchema", () => {
  it("normaliza vacíos a null y el WhatsApp a dígitos", () => {
    const r = profileSchema.safeParse({
      name: "  Barbería Demo  ",
      description: "   ",
      address: "",
      whatsapp: "+54 9 (11) 1234-5678",
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      name: "Barbería Demo",
      description: null,
      address: null,
      whatsapp: "+5491112345678",
    });
  });

  it("acepta textos con contenido", () => {
    const r = profileSchema.safeParse({
      name: "X",
      description: "Cortes clásicos",
      address: "Av. Siempre Viva 742",
      whatsapp: "1112345678",
    });
    expect(r.success).toBe(true);
    expect(r.data?.whatsapp).toBe("1112345678");
  });

  it("rechaza name vacío", () => {
    const r = profileSchema.safeParse({ name: "   " });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["name"]);
  });

  it("rechaza name de más de 80 caracteres y descripción de más de 500", () => {
    expect(profileSchema.safeParse({ name: "a".repeat(81) }).success).toBe(false);
    expect(profileSchema.safeParse({ name: "a", description: "a".repeat(501) }).success).toBe(false);
  });

  it("ya no acepta ni devuelve logoUrl (el logo se sube desde Página pública)", () => {
    const r = profileSchema.safeParse({ name: "X", logoUrl: "javascript:alert(1)" });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("logoUrl");
  });

  it.each(["1234567", "+54 11 123", "11-abc-12345", "1234567890123456"])("rechaza WhatsApp %s", (whatsapp) => {
    const r = profileSchema.safeParse({ name: "X", whatsapp });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["whatsapp"]);
  });
});

function week(overrides: Partial<Record<number, OpeningHoursInput[number]>> = {}): OpeningHoursInput {
  return [0, 1, 2, 3, 4, 5, 6].map(
    (weekday) => overrides[weekday] ?? { weekday, closed: false, opensAt: "10:00", closesAt: "20:00" },
  );
}

describe("openingHoursSchema", () => {
  it("acepta una semana válida y la devuelve ordenada por weekday", () => {
    const input = week().reverse();
    const r = openingHoursSchema.safeParse(input);
    expect(r.success).toBe(true);
    expect(r.data?.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("un día cerrado sale con horas null aunque traiga horas", () => {
    const r = openingHoursSchema.safeParse(week({ 0: { weekday: 0, closed: true, opensAt: "10:00", closesAt: "14:00" } }));
    expect(r.success).toBe(true);
    expect(r.data?.[0]).toEqual({ weekday: 0, closed: true, opensAt: null, closesAt: null });
  });

  it("rechaza opensAt >= closesAt", () => {
    const igual = openingHoursSchema.safeParse(week({ 1: { weekday: 1, closed: false, opensAt: "10:00", closesAt: "10:00" } }));
    const invertido = openingHoursSchema.safeParse(week({ 1: { weekday: 1, closed: false, opensAt: "20:00", closesAt: "10:00" } }));
    expect(igual.success).toBe(false);
    expect(invertido.success).toBe(false);
  });

  it("rechaza horas inválidas como 25:00 y faltantes en un día abierto", () => {
    expect(openingHoursSchema.safeParse(week({ 2: { weekday: 2, closed: false, opensAt: "10:00", closesAt: "25:00" } })).success).toBe(false);
    expect(openingHoursSchema.safeParse(week({ 2: { weekday: 2, closed: false, opensAt: "9:00", closesAt: "18:00" } })).success).toBe(false);
    expect(openingHoursSchema.safeParse(week({ 2: { weekday: 2, closed: false, opensAt: null, closesAt: "18:00" } })).success).toBe(false);
  });

  it("rechaza días repetidos", () => {
    const input = week();
    input[6] = { weekday: 5, closed: true };
    expect(openingHoursSchema.safeParse(input).success).toBe(false);
  });

  it("rechaza una cantidad de días distinta de 7", () => {
    expect(openingHoursSchema.safeParse(week().slice(0, 6)).success).toBe(false);
    expect(openingHoursSchema.safeParse([...week(), { weekday: 0, closed: true }]).success).toBe(false);
  });

  it("rechaza weekday fuera de 0–6", () => {
    const input = week();
    input[0] = { weekday: 7, closed: true };
    expect(openingHoursSchema.safeParse(input).success).toBe(false);
  });

  it("agrupa los errores por weekday", () => {
    const input = week({ 3: { weekday: 3, closed: false, opensAt: "18:00", closesAt: "09:00" } });
    const r = openingHoursSchema.safeParse(input);
    expect(r.success).toBe(false);
    const { byDay, form } = openingHoursErrors(r.error!, input);
    expect(Object.keys(byDay)).toEqual(["3"]);
    expect(form).toBeUndefined();
  });
});

describe("normalizeDecimal", () => {
  it("canoniza sin pasar por float", () => {
    expect(normalizeDecimal("007")).toBe("7");
    expect(normalizeDecimal("120000.00")).toBe("120000");
    expect(normalizeDecimal("0.10")).toBe("0.1");
    expect(normalizeDecimal(" 15,25 ")).toBe("15.25");
    expect(normalizeDecimal("1.")).toBeNull();
  });
});
