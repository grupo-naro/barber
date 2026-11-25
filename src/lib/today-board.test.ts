import { describe, expect, it } from "vitest";
import type { TodayAppointment } from "@/server/queries/records";
import { appointmentTag, daySummary, findOpenTarget, nowLineIndex } from "./today-board";

describe("nowLineIndex", () => {
  const at = (h: string) => new Date(`2026-11-24T${h}:00-03:00`);

  it("la línea va antes del primer turno cuya hora no terminó", () => {
    const list = ["10:00", "11:00", "12:00", "12:00"].map(at);
    expect(nowLineIndex(list, at("11:20"))).toBe(1);
    expect(nowLineIndex(list, at("11:00"))).toBe(1); // 10:00 terminó justo a las 11:00
    expect(nowLineIndex(list, at("09:00"))).toBe(0);
    expect(nowLineIndex(list, at("13:00"))).toBe(4);
    expect(nowLineIndex([], at("11:00"))).toBe(0);
  });
});

describe("appointmentTag", () => {
  const martin = { id: "b", name: "Martín" };
  const owner = { role: "OWNER", userId: "o" } as const;
  const barber = { role: "BARBER", userId: "b" } as const;

  it("etiquetas", () => {
    expect(appointmentTag({ status: "PENDING", barber: null }, owner)).toEqual({ label: "Sin asignar", tone: "accent" });
    expect(appointmentTag({ status: "CONFIRMED", barber: martin }, owner)).toEqual({ label: "Martín", tone: "neutral" });
    expect(appointmentTag({ status: "COMPLETED", barber: martin }, owner)).toEqual({ label: "Listo", tone: "muted" });
    expect(appointmentTag({ status: "NO_SHOW", barber: null }, owner)).toEqual({ label: "No vino", tone: "muted" });
    expect(appointmentTag({ status: "CANCELLED", barber: null }, owner)).toEqual({ label: "Cancelado", tone: "muted" });
  });

  it.each(["PENDING", "CONFIRMED"] as const)("%s: el barbero no ve su propio nombre", (status) => {
    expect(appointmentTag({ status, barber: martin }, barber)).toBeNull();
  });

  it("el barbero ve Sin asignar en lo que no es de nadie", () => {
    expect(appointmentTag({ status: "PENDING", barber: null }, barber)).toEqual({ label: "Sin asignar", tone: "accent" });
  });

  it("el barbero ve el resultado de sus turnos terminados", () => {
    expect(appointmentTag({ status: "COMPLETED", barber: martin }, barber)).toEqual({ label: "Listo", tone: "muted" });
    expect(appointmentTag({ status: "NO_SHOW", barber: martin }, barber)).toEqual({ label: "No vino", tone: "muted" });
    expect(appointmentTag({ status: "CANCELLED", barber: martin }, barber)).toEqual({ label: "Cancelado", tone: "muted" });
  });

  it.each(["PENDING", "CONFIRMED"] as const)("%s: el dueño ve el nombre también en lo que atiende él", (status) => {
    const self = { id: "o", name: "Nora" };
    expect(appointmentTag({ status, barber: self }, owner)).toEqual({ label: "Nora", tone: "neutral" });
    expect(appointmentTag({ status, barber: martin }, owner)).toEqual({ label: "Martín", tone: "neutral" });
  });
});

describe("daySummary", () => {
  it("resumen", () => {
    expect(daySummary("BARBER", 2, "36000.00")).toBe("Hiciste 2 cortes por $36.000");
    expect(daySummary("BARBER", 1, "15000.00")).toBe("Hiciste 1 corte por $15.000");
    expect(daySummary("BARBER", 0, "0.00")).toBe("Todavía no hiciste cortes hoy");
    expect(daySummary("OWNER", 5, "88000.00")).toBe("La barbería lleva 5 cortes por $88.000");
    expect(daySummary("OWNER", 1, "15000.50")).toBe("La barbería lleva 1 corte por $15.000,50");
    expect(daySummary("OWNER", 0, "0.00")).toBe("La barbería todavía no tiene cortes hoy");
  });
});

describe("findOpenTarget", () => {
  const make = (id: string, status: TodayAppointment["status"]): TodayAppointment => ({
    id,
    startsAt: new Date("2026-11-24T13:00:00.000Z"),
    status,
    notes: null,
    customer: { id: "c", name: "Juan", phone: "5491155000101", notes: null },
    barber: null,
    service: { id: "s", name: "Corte", price: "15000.00", active: true },
  });
  const items = [
    make("pending", "PENDING"),
    make("confirmed", "CONFIRMED"),
    make("completed", "COMPLETED"),
    make("no-show", "NO_SHOW"),
    make("cancelled", "CANCELLED"),
  ];

  it.each(["pending", "confirmed"])("%s está abierto", (id) => {
    expect(findOpenTarget(items, id)).toEqual({ state: "open", appointment: items.find((i) => i.id === id) });
  });

  it.each(["completed", "no-show", "cancelled"])("%s está terminado", (id) => {
    expect(findOpenTarget(items, id)).toEqual({ state: "done", appointment: items.find((i) => i.id === id) });
  });

  it("un id ausente ya no está", () => {
    expect(findOpenTarget(items, "otro")).toEqual({ state: "gone" });
    expect(findOpenTarget([], "pending")).toEqual({ state: "gone" });
  });
});
