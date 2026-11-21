import { describe, expect, it } from "vitest";
import { isNavItemActive, navItemsForRole } from "./dashboard-nav";

describe("navItemsForRole", () => {
  it("OWNER ve Hoy, Servicios, Caja y Configuración en ese orden", () => {
    expect(navItemsForRole("OWNER")).toEqual([
      { href: "/dashboard/today", label: "Hoy" },
      { href: "/dashboard/services", label: "Servicios" },
      { href: "/dashboard/cash", label: "Caja" },
      { href: "/dashboard/settings", label: "Configuración" },
    ]);
  });

  it("BARBER ve solo Hoy", () => {
    expect(navItemsForRole("BARBER")).toEqual([{ href: "/dashboard/today", label: "Hoy" }]);
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
