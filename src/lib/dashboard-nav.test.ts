import { describe, expect, it } from "vitest";
import { isNavItemActive, navItemsForRole } from "./dashboard-nav";

describe("navItemsForRole", () => {
  it("orden del dueño", () => {
    expect(navItemsForRole("OWNER").map((i) => i.label)).toEqual(["Hoy", "Caja", "Servicios", "Barberos", "Ajustes"]);
    expect(navItemsForRole("OWNER").map((i) => i.href)).toEqual([
      "/dashboard/today",
      "/dashboard/cash",
      "/dashboard/services",
      "/dashboard/barbers",
      "/dashboard/settings",
    ]);
  });

  it("barbero", () => {
    expect(navItemsForRole("BARBER")).toEqual([
      { href: "/dashboard/today", label: "Hoy" },
      { href: "/dashboard/account", label: "Mi cuenta" },
    ]);
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

  it.each(["OWNER", "BARBER"] as const)("exactamente un ítem activo por pathname de sección (%s)", (role) => {
    const own = navItemsForRole(role);
    for (const item of own) {
      expect(own.filter((i) => isNavItemActive(item.href, i.href)).map((i) => i.label)).toEqual([item.label]);
    }
  });

  it("Mi cuenta no activa ningún ítem del dueño (no tiene esa pestaña)", () => {
    expect(activeLabels("/dashboard/account")).toEqual([]);
  });
});
