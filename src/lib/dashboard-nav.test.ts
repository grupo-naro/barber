import { describe, expect, it } from "vitest";
import { isNavItemActive, navItemsForRole } from "./dashboard-nav";

describe("navItemsForRole", () => {
  it("OWNER ve Hoy, Servicios, Caja, Barberos y Ajustes en ese orden", () => {
    expect(navItemsForRole("OWNER")).toEqual([
      { href: "/dashboard/today", label: "Hoy" },
      { href: "/dashboard/services", label: "Servicios" },
      { href: "/dashboard/cash", label: "Caja" },
      { href: "/dashboard/barbers", label: "Barberos" },
      { href: "/dashboard/settings", label: "Ajustes" },
    ]);
  });

  it("BARBER ve solo Hoy", () => {
    expect(navItemsForRole("BARBER")).toEqual([{ href: "/dashboard/today", label: "Hoy" }]);
    expect(navItemsForRole("BARBER").some((item) => item.href === "/dashboard/barbers")).toBe(false);
  });
});

describe("labels de la barra inferior", () => {
  it("son cortos: con 5 ítems a 360px quedan ~56px por label en text-xs", () => {
    for (const item of navItemsForRole("OWNER")) expect(item.label.length, item.label).toBeLessThanOrEqual(9);
  });
});

describe("isNavItemActive", () => {
  const items = navItemsForRole("OWNER");
  const activeLabels = (pathname: string) =>
    items.filter((item) => isNavItemActive(pathname, item.href)).map((item) => item.label);

  it("activa la sección exacta y sus subrutas", () => {
    expect(activeLabels("/dashboard/today")).toEqual(["Hoy"]);
    expect(activeLabels("/dashboard/today/customers/abc")).toEqual(["Hoy"]);
    expect(activeLabels("/dashboard/services/abc")).toEqual(["Servicios"]);
    expect(activeLabels("/dashboard/barbers/abc")).toEqual(["Barberos"]);
  });

  it("no activa por prefijo parcial ni en la home del panel", () => {
    expect(activeLabels("/dashboard/todayx")).toEqual([]);
    expect(activeLabels("/dashboard")).toEqual([]);
  });

  it("exactamente un ítem activo por pathname de sección", () => {
    for (const item of items) {
      expect(activeLabels(item.href)).toEqual([item.label]);
    }
  });
});
