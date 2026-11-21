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

type DayInput = OpeningHoursInput[number];

const open = (weekday: number, ...ranges: [string | null, string | null][]): DayInput => ({
  weekday,
  closed: false,
  ranges: ranges.map(([opensAt, closesAt]) => ({ opensAt, closesAt })),
});

function week(overrides: Partial<Record<number, DayInput>> = {}): OpeningHoursInput {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => overrides[weekday] ?? open(weekday, ["10:00", "20:00"]));
}

describe("openingHoursSchema", () => {
  it("acepta una semana válida y la devuelve ordenada por weekday", () => {
    const input = week().reverse();
    const r = openingHoursSchema.safeParse(input);
    expect(r.success).toBe(true);
    expect(r.data?.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(r.data?.[1]).toEqual({ weekday: 1, closed: false, ranges: [{ opensAt: "10:00", closesAt: "20:00" }] });
  });

  it("un día cerrado sale con ranges [] aunque traiga horas", () => {
    const r = openingHoursSchema.safeParse(
      week({ 0: { weekday: 0, closed: true, ranges: [{ opensAt: "10:00", closesAt: "14:00" }] } }),
    );
    expect(r.success).toBe(true);
    expect(r.data?.[0]).toEqual({ weekday: 0, closed: true, ranges: [] });
    const sinRanges = openingHoursSchema.safeParse(week({ 0: { weekday: 0, closed: true } }));
    expect(sinRanges.data?.[0]).toEqual({ weekday: 0, closed: true, ranges: [] });
  });

  it("acepta horario cortado 10–14 + 17–21", () => {
    const r = openingHoursSchema.safeParse(week({ 2: open(2, ["10:00", "14:00"], ["17:00", "21:00"]) }));
    expect(r.success).toBe(true);
    expect(r.data?.[2].ranges).toEqual([
      { opensAt: "10:00", closesAt: "14:00" },
      { opensAt: "17:00", closesAt: "21:00" },
    ]);
  });

  it("ordena las franjas desordenadas por apertura", () => {
    const r = openingHoursSchema.safeParse(week({ 2: open(2, ["17:00", "21:00"], ["10:00", "14:00"]) }));
    expect(r.success).toBe(true);
    expect(r.data?.[2].ranges.map((x) => x.opensAt)).toEqual(["10:00", "17:00"]);
  });

  it("permite franjas que se tocan (10–14 + 14–18)", () => {
    expect(openingHoursSchema.safeParse(week({ 2: open(2, ["10:00", "14:00"], ["14:00", "18:00"]) })).success).toBe(true);
  });

  it("rechaza franjas que se pisan (10–15 + 14–18), aunque vengan desordenadas", () => {
    const input = week({ 2: open(2, ["14:00", "18:00"], ["10:00", "15:00"]) });
    const r = openingHoursSchema.safeParse(input);
    expect(r.success).toBe(false);
    expect(openingHoursErrors(r.error!, input).byDay).toEqual({ "2": "Las franjas no se pueden superponer" });
  });

  it("rechaza 3 franjas y un día abierto sin franjas", () => {
    const tres = openingHoursSchema.safeParse(
      week({ 2: open(2, ["08:00", "10:00"], ["11:00", "13:00"], ["17:00", "21:00"]) }),
    );
    expect(tres.success).toBe(false);
    expect(tres.error?.issues[0].message).toBe("Puede haber como mucho 2 franjas por día");
    expect(openingHoursSchema.safeParse(week({ 2: open(2) })).success).toBe(false);
    expect(openingHoursSchema.safeParse(week({ 2: { weekday: 2, closed: false } })).success).toBe(false);
  });

  it("rechaza opensAt >= closesAt en cualquier franja", () => {
    expect(openingHoursSchema.safeParse(week({ 1: open(1, ["10:00", "10:00"]) })).success).toBe(false);
    expect(openingHoursSchema.safeParse(week({ 1: open(1, ["20:00", "10:00"]) })).success).toBe(false);
    const segunda = openingHoursSchema.safeParse(week({ 1: open(1, ["10:00", "14:00"], ["21:00", "17:00"]) }));
    expect(segunda.success).toBe(false);
    expect(segunda.error?.issues[0].message).toBe("El cierre tiene que ser después de la apertura");
  });

  it("rechaza horas con formato inválido y faltantes en un día abierto", () => {
    expect(openingHoursSchema.safeParse(week({ 2: open(2, ["10:00", "25:00"]) })).success).toBe(false);
    expect(openingHoursSchema.safeParse(week({ 2: open(2, ["9:00", "18:00"]) })).success).toBe(false);
    expect(openingHoursSchema.safeParse(week({ 2: open(2, [null, "18:00"]) })).success).toBe(false);
    expect(openingHoursSchema.safeParse(week({ 2: open(2, ["10:00", "14:00"], ["", ""]) })).success).toBe(false);
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

  it("agrupa los errores por weekday, en español", () => {
    const input = week({
      3: open(3, ["18:00", "09:00"]),
      5: open(5, ["10:00", "14:00"], ["xx", "21:00"]),
    });
    const r = openingHoursSchema.safeParse(input);
    expect(r.success).toBe(false);
    const { byDay, form } = openingHoursErrors(r.error!, input);
    expect(byDay).toEqual({
      "3": "El cierre tiene que ser después de la apertura",
      "5": "Hora de apertura inválida",
    });
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
