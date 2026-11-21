import { describe, expect, it } from "vitest";
import { decidePublicSlug, decideRoute, isPrivatePath, publicSlugFromPath, safeNextPath } from "./proxy";

describe("proxy: safeNextPath (anti open-redirect)", () => {
  it("bloquea los bypass conocidos y cae en /dashboard", () => {
    const attacks = [
      "/\t/evil.com",
      "/%09/evil.com",
      "/\n/evil.com",
      "/%0A/evil.com",
      "/\r/evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "\\\\evil.com",
      "https://evil.com",
      "http:/evil.com",
      "javascript:alert(1)",
      " /dashboard",
      "/barberia-demo",
      "/",
      "",
      undefined,
      null,
    ];
    for (const next of attacks) expect(safeNextPath(next), JSON.stringify(next)).toBe("/dashboard");
  });

  it("acepta rutas privadas internas conservando la query", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/cash/2026-11-20?x=1")).toBe("/cash/2026-11-20?x=1");
    expect(safeNextPath("/settings")).toBe("/settings");
  });
});

describe("proxy: decideRoute", () => {
  it("sin sesión, las rutas privadas redirigen a /login?next=<ruta>", () => {
    expect(decideRoute("/dashboard", "", false)).toEqual({
      action: "redirect",
      location: "/login?next=%2Fdashboard",
    });
    expect(decideRoute("/cash/2026-11-20", "?x=1", false)).toEqual({
      action: "redirect",
      location: "/login?next=%2Fcash%2F2026-11-20%3Fx%3D1",
    });
    for (const p of ["/settings", "/services/abc", "/today"]) {
      expect(decideRoute(p, "", false).action).toBe("redirect");
    }
  });

  it("con sesión, las rutas privadas pasan", () => {
    expect(decideRoute("/dashboard", "", true)).toEqual({ action: "next" });
  });

  it("/login con sesión válida redirige a /dashboard; sin sesión pasa", () => {
    expect(decideRoute("/login", "", true)).toEqual({ action: "redirect", location: "/dashboard" });
    expect(decideRoute("/login", "", false)).toEqual({ action: "next" });
  });

  it("rutas públicas y slugs no se tocan", () => {
    for (const p of ["/", "/barberia-demo", "/dashboards", "/cashflow", "/api/x", "/_next/static/a.js"]) {
      expect(decideRoute(p, "", false)).toEqual({ action: "next" });
      expect(decideRoute(p, "", true)).toEqual({ action: "next" });
    }
    expect(isPrivatePath("/dashboard-demo")).toBe(false);
  });
});

describe("proxy: decidePublicSlug (404 real para slugs inexistentes)", () => {
  function lookup(result: boolean) {
    const calls: string[] = [];
    const fn = async (slug: string) => {
      calls.push(slug);
      return result;
    };
    return { fn, calls };
  }

  it("slug válido inexistente → not-found; existente → next", async () => {
    const missing = lookup(false);
    expect(await decidePublicSlug("/no-existe-xyz", missing.fn)).toEqual({ action: "not-found" });
    expect(missing.calls).toEqual(["no-existe-xyz"]);

    const existing = lookup(true);
    expect(await decidePublicSlug("/barberia-demo", existing.fn)).toEqual({ action: "next" });
    expect(existing.calls).toEqual(["barberia-demo"]);
  });

  it("reservados e inválidos → not-found sin consultar la DB", async () => {
    for (const p of ["/login", "/dashboard", "/api", "/_next", "/admin", "/Barberia", "/de--mo", "/ab"]) {
      const l = lookup(true);
      expect(await decidePublicSlug(p, l.fn), p).toEqual({ action: "not-found" });
      expect(l.calls, p).toEqual([]);
    }
  });

  it("/login y /dashboard siguen con la decisión de sesión de siempre", () => {
    expect(decideRoute("/login", "", false)).toEqual({ action: "next" });
    expect(decideRoute("/dashboard", "", false)).toEqual({
      action: "redirect",
      location: "/login?next=%2Fdashboard",
    });
  });

  it("/invitacion/<token> es público: no pide sesión ni pasa por el chequeo de slug", async () => {
    expect(isPrivatePath("/invitacion/abc")).toBe(false);
    expect(decideRoute("/invitacion/abc", "", false)).toEqual({ action: "next" });
    const l = lookup(false);
    expect(publicSlugFromPath("/invitacion/abc")).toBeNull();
    expect(await decidePublicSlug("/invitacion/abc", l.fn)).toEqual({ action: "skip" });
    expect(l.calls).toEqual([]);
    // `/invitacion` suelto es un slug reservado → 404 sin consultar la DB.
    expect(await decidePublicSlug("/invitacion", l.fn)).toEqual({ action: "not-found" });
    expect(l.calls).toEqual([]);
  });

  it("no aplica a /, archivos estáticos ni rutas de más de un segmento", async () => {
    for (const p of ["/", "/favicon.ico", "/dashboard/cash", "/_next/static/a.js", "/api/x", "/a/b"]) {
      const l = lookup(false);
      expect(publicSlugFromPath(p), p).toBeNull();
      expect(await decidePublicSlug(p, l.fn), p).toEqual({ action: "skip" });
      expect(l.calls, p).toEqual([]);
    }
  });
});
