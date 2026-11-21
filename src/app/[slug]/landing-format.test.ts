import { describe, expect, it } from "vitest";
import { hasOpeningHours, initials, weeklyHours, whatsappMessageUrl, type OpeningHoursRow } from "./landing-format";

describe("whatsappMessageUrl", () => {
  it("agrega el mensaje codificado", () => {
    const url = whatsappMessageUrl("https://wa.me/5491123456789", "Barbería Don Pepe");
    expect(url).toBe(
      "https://wa.me/5491123456789?text=Hola%20Barber%C3%ADa%20Don%20Pepe!%20Quer%C3%ADa%20consultar%20por%20un%20turno.",
    );
    const text = new URL(url!).searchParams.get("text");
    expect(text).toBe("Hola Barbería Don Pepe! Quería consultar por un turno.");
  });

  it("codifica & y ? del nombre sin romper la query", () => {
    const url = whatsappMessageUrl("https://wa.me/541100000000", "Corte & Barba? Club")!;
    expect(url).not.toContain("& ");
    expect(url.split("?")).toHaveLength(2);
    const params = new URL(url).searchParams;
    expect([...params.keys()]).toEqual(["text"]);
    expect(params.get("text")).toBe("Hola Corte & Barba? Club! Quería consultar por un turno.");
  });

  it("devuelve null sin WhatsApp", () => {
    expect(whatsappMessageUrl(null, "X")).toBeNull();
    expect(whatsappMessageUrl(undefined, "X")).toBeNull();
    expect(whatsappMessageUrl("", "X")).toBeNull();
  });
});

describe("weeklyHours", () => {
  const rows: OpeningHoursRow[] = [
    { weekday: 0, opensAt: null, closesAt: null, closed: true },
    { weekday: 6, opensAt: "10:00", closesAt: "18:00", closed: false },
    { weekday: 1, opensAt: "09:00", closesAt: "20:00", closed: false },
    { weekday: 3, opensAt: "09:00", closesAt: "20:00", closed: true },
    { weekday: 4, opensAt: null, closesAt: "20:00", closed: false },
  ];

  it("ordena de lunes a domingo", () => {
    const days = weeklyHours(rows, 1);
    expect(days.map((d) => d.label)).toEqual([
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ]);
    expect(days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("formatea los abiertos y marca Cerrado los cerrados o sin cargar", () => {
    const byLabel = Object.fromEntries(weeklyHours(rows, 1).map((d) => [d.label, d.hours]));
    expect(byLabel).toEqual({
      Lunes: "09:00 – 20:00",
      Martes: "Cerrado", // sin fila
      Miércoles: "Cerrado", // closed con horas cargadas
      Jueves: "Cerrado", // horas incompletas
      Viernes: "Cerrado",
      Sábado: "10:00 – 18:00",
      Domingo: "Cerrado",
    });
  });

  it("marca solo el día de hoy según el weekday dado", () => {
    expect(weeklyHours(rows, 0).filter((d) => d.isToday).map((d) => d.label)).toEqual(["Domingo"]);
    expect(weeklyHours(rows, 6).filter((d) => d.isToday).map((d) => d.label)).toEqual(["Sábado"]);
  });

  it("hasOpeningHours es false si no hay ningún día abierto", () => {
    expect(hasOpeningHours(weeklyHours([], 2))).toBe(false);
    expect(hasOpeningHours(weeklyHours(rows, 2))).toBe(true);
  });
});

describe("initials", () => {
  it("toma hasta dos iniciales", () => {
    expect(initials("barbería  del centro")).toBe("BD");
    expect(initials("Pepe")).toBe("P");
  });
});
