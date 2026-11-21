import { describe, expect, it } from "vitest";
import { signAdminSession } from "./lib/admin-session";
import { signSession, verifySession } from "./lib/session";
import {
  config,
  decideAdminRequest,
  decideAdminRoute,
  decidePublicSlug,
  decideRoute,
  isAdminPath,
  isPrivatePath,
  isLoginNotice,
  isSuspendedNotice,
  publicSlugFromPath,
  safeNextPath,
} from "./proxy";

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

describe("proxy: panel de la plataforma (/admin)", () => {
  const secret = new TextEncoder().encode("test-secret-de-al-menos-32-caracteres!!");

  it("isAdminPath solo matchea /admin y /admin/**", () => {
    for (const p of ["/admin", "/admin/", "/admin/login", "/admin/barbershops/new"]) expect(isAdminPath(p), p).toBe(true);
    for (const p of ["/administracion", "/admin-x", "/", "/dashboard", "/barberia-demo"]) expect(isAdminPath(p), p).toBe(false);
  });

  it("sin cookie de admin: /admin y /admin/** → /admin/login; /admin/login pasa", () => {
    for (const p of ["/admin", "/admin/barbershops", "/admin/barbershops/new", "/admin/barbershops/abc"]) {
      expect(decideAdminRoute(p, false), p).toEqual({ action: "redirect", location: "/admin/login" });
    }
    expect(decideAdminRoute("/admin/login", false)).toEqual({ action: "next" });
  });

  it("con cookie de admin: /admin/** pasa y /admin/login → /admin", () => {
    expect(decideAdminRoute("/admin", true)).toEqual({ action: "next" });
    expect(decideAdminRoute("/admin/barbershops/abc", true)).toEqual({ action: "next" });
    expect(decideAdminRoute("/admin/login", true)).toEqual({ action: "redirect", location: "/admin" });
  });

  it("no aplica fuera de /admin", () => {
    expect(decideAdminRoute("/dashboard", true)).toBeNull();
    expect(decideAdminRoute("/barberia-demo", false)).toBeNull();
  });

  it("con el JWT real: admin pasa, una cookie de barbería (OWNER) en /admin/barbershops → /admin/login", async () => {
    const adminToken = await signAdminSession({ adminId: "a1" }, secret);
    const ownerToken = await signSession({ userId: "u1", barbershopId: "b1", role: "OWNER" }, secret);
    expect(await decideAdminRequest("/admin/barbershops", adminToken, secret)).toEqual({ action: "next" });
    expect(await decideAdminRequest("/admin/barbershops", ownerToken, secret)).toEqual({
      action: "redirect",
      location: "/admin/login",
    });
    expect(await decideAdminRequest("/admin", undefined, secret)).toEqual({ action: "redirect", location: "/admin/login" });
    expect(await decideAdminRequest("/admin/login", adminToken, secret)).toEqual({ action: "redirect", location: "/admin" });
    expect(await decideAdminRequest("/admin/login", ownerToken, secret)).toEqual({ action: "next" });
    expect(await decideAdminRequest("/dashboard", adminToken, secret)).toBeNull();
  });

  it("la sesión de admin no da acceso al panel de barbería", async () => {
    const adminToken = await signAdminSession({ adminId: "a1" }, secret);
    const asBarbershop = await verifySession(adminToken, secret);
    expect(asBarbershop).toBeNull();
    expect(decideRoute("/dashboard", "", asBarbershop !== null)).toEqual({
      action: "redirect",
      location: "/login?next=%2Fdashboard",
    });
  });

  it("decidePublicSlug('/admin') sigue siendo not-found (admin reservado) sin tocar la DB", async () => {
    const calls: string[] = [];
    expect(await decidePublicSlug("/admin", async (s) => (calls.push(s), true))).toEqual({ action: "not-found" });
    expect(calls).toEqual([]);
  });

  it("el matcher incluye /admin y /admin/:path*", () => {
    expect(config.matcher).toContain("/admin");
    expect(config.matcher).toContain("/admin/:path*");
  });
});

describe("proxy: barbería suspendida (sin loop /login ↔ /dashboard)", () => {
  it("/login?suspended=1 con JWT válido NO redirige a /dashboard", () => {
    expect(isSuspendedNotice("?suspended=1")).toBe(true);
    expect(decideRoute("/login", "?suspended=1", true)).toEqual({ action: "next" });
    expect(decideRoute("/login", "?suspended=1", false)).toEqual({ action: "next" });
  });

  it("/login sin el aviso sigue redirigiendo con sesión", () => {
    expect(isSuspendedNotice("")).toBe(false);
    expect(isSuspendedNotice("?suspended=0")).toBe(false);
    expect(decideRoute("/login", "?next=%2Fcash", true)).toEqual({ action: "redirect", location: "/dashboard" });
  });

  it("recorrido: /dashboard (JWT válido) → requireSession manda a /login?suspended=1 → el proxy lo deja pasar", () => {
    // 1. El proxy deja pasar /dashboard (JWT válido; la DB la mira getSession).
    expect(decideRoute("/dashboard", "", true)).toEqual({ action: "next" });
    // 2. getSession ve SUSPENDED → requireSession redirige a /login?suspended=1, que el proxy no rebota.
    expect(decideRoute("/login", "?suspended=1", true)).toEqual({ action: "next" });
  });
});

describe("proxy: avisos de /login (inactivo, sesión vencida por cambio de contraseña)", () => {
  const notices = ["?suspended=1", "?inactive=1", "?expired=1"];

  it("los tres avisos con JWT válido NO redirigen a /dashboard", () => {
    for (const search of notices) {
      expect(isLoginNotice(search)).toBe(true);
      expect(decideRoute("/login", search, true)).toEqual({ action: "next" });
      expect(decideRoute("/login", search, false)).toEqual({ action: "next" });
    }
  });

  it("valores que no son exactamente \"1\" no cuentan como aviso: con sesión siguen yendo a /dashboard", () => {
    const invalid = ["", "?inactive=0", "?expired=true", "?expired=", "?expired", "?inactive=11", "?suspended=yes", "?other=1"];
    for (const search of invalid) {
      expect(isLoginNotice(search)).toBe(false);
      expect(decideRoute("/login", search, true)).toEqual({ action: "redirect", location: "/dashboard" });
    }
  });

  it("recorrido anti-loop: /dashboard (JWT válido) → requireSession → /login?inactive=1 | ?expired=1 → pasa", () => {
    for (const notice of ["?inactive=1", "?expired=1"]) {
      // 1. El proxy deja pasar /dashboard (JWT válido; la DB la mira lookupSession).
      expect(decideRoute("/dashboard", "", true)).toEqual({ action: "next" });
      expect(decideRoute("/dashboard/today", "", true)).toEqual({ action: "next" });
      // 2. lookupSession rechaza (inactive / expired) → requireSession redirige al aviso, que el proxy no rebota.
      expect(decideRoute("/login", notice, true)).toEqual({ action: "next" });
    }
  });

  it("/login?expired=1&next=//evil.com no produce ningún location externo", () => {
    for (const valid of [true, false]) {
      const decision = decideRoute("/login", "?expired=1&next=//evil.com", valid);
      expect(decision).toEqual({ action: "next" });
    }
    // El `next` que llega junto al aviso sigue pasando por safeNextPath al loguearse.
    const next = new URLSearchParams("?expired=1&next=//evil.com").get("next");
    expect(safeNextPath(next)).toBe("/dashboard");
    expect(safeNextPath(new URLSearchParams("?inactive=1&next=%2F%2Fevil.com").get("next"))).toBe("/dashboard");
    // Sin el aviso válido, con sesión, el destino es siempre relativo.
    const fallback = decideRoute("/login", "?expired=true&next=//evil.com", true);
    expect(fallback).toEqual({ action: "redirect", location: "/dashboard" });
  });
});
