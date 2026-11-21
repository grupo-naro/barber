import { describe, expect, it } from "vitest";
import {
  adminLoginSchema,
  createBarbershopSchema,
  defaultOpeningHours,
  generateAdminPassword,
  invitationAllowsUser,
  lastActivity,
  monthRange,
  normalizeSearch,
  suggestSlug,
  planBanner,
  planBannerMessage,
  planExpiresAtFromDate,
  updateBarbershopSchema,
} from "./platform-admin";

const TZ = "America/Argentina/Buenos_Aires";
const DAY = 24 * 60 * 60 * 1000;

describe("platform-admin: schemas", () => {
  const valid = { name: " Barbería Norte ", slug: " Barberia-Norte ", ownerName: "Ana", ownerEmail: " Ana@Mail.COM " };

  it("crear: normaliza nombre, slug y email", () => {
    const parsed = createBarbershopSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      name: "Barbería Norte",
      slug: "barberia-norte",
      ownerName: "Ana",
      ownerEmail: "ana@mail.com",
    });
  });

  it("crear: valida el slug con validateSlug (reservados, formato, largo)", () => {
    for (const slug of ["admin", "login", "ab", "de--mo", "-demo", "con espacio", "ñandú"]) {
      const parsed = createBarbershopSchema.safeParse({ ...valid, slug });
      expect(parsed.success, slug).toBe(false);
      expect(parsed.error?.issues[0].path, slug).toEqual(["slug"]);
    }
  });

  it("crear: rechaza email inválido y campos vacíos", () => {
    expect(createBarbershopSchema.safeParse({ ...valid, ownerEmail: "no-es-email" }).success).toBe(false);
    expect(createBarbershopSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
    expect(createBarbershopSchema.safeParse({ ...valid, ownerName: "" }).success).toBe(false);
  });

  const edit = { id: "b1", name: "Norte", slug: "norte", ownerEmail: "A@B.com", plan: "PRO", planExpiresAt: "2026-12-31" };

  it("editar: plan es el enum y la fecha es opcional", () => {
    expect(updateBarbershopSchema.parse(edit)).toMatchObject({ plan: "PRO", planExpiresAt: "2026-12-31", ownerEmail: "a@b.com" });
    expect(updateBarbershopSchema.parse({ ...edit, planExpiresAt: "" }).planExpiresAt).toBeNull();
    expect(updateBarbershopSchema.parse({ ...edit, planExpiresAt: undefined }).planExpiresAt).toBeNull();
    expect(updateBarbershopSchema.safeParse({ ...edit, plan: "GOLD" }).success).toBe(false);
    expect(updateBarbershopSchema.safeParse({ ...edit, planExpiresAt: "2026-02-30" }).success).toBe(false);
    expect(updateBarbershopSchema.safeParse({ ...edit, planExpiresAt: "mañana" }).success).toBe(false);
    expect(updateBarbershopSchema.safeParse({ ...edit, slug: "admin" }).success).toBe(false);
  });

  it("suggestSlug arma un slug desde el nombre", () => {
    expect(suggestSlug("Barbería Ñandú & Co.")).toBe("barberia-nandu-co");
    expect(suggestSlug("  --Hola   Mundo--  ")).toBe("hola-mundo");
    expect(suggestSlug("")).toBe("");
    const long = suggestSlug("a".repeat(39) + " bcd");
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith("-")).toBe(false);
  });

  it("login de admin: el email se recorta antes de validarse", () => {
    expect(adminLoginSchema.parse({ email: "  Admin@X.com ", password: "x" }).email).toBe("admin@x.com");
  });

  it("normalizeSearch recorta y acota", () => {
    expect(normalizeSearch("  norte ")).toBe("norte");
    expect(normalizeSearch(undefined)).toBe("");
    expect(normalizeSearch(["a"])).toBe("");
    expect(normalizeSearch("x".repeat(200))).toHaveLength(80);
  });
});

describe("platform-admin: planBanner", () => {
  const now = new Date("2026-11-21T15:00:00Z");

  it("null o faltan más de 7 días → none", () => {
    expect(planBanner(null, now, TZ)).toEqual({ kind: "none" });
    expect(planBanner(new Date(now.getTime() + 7 * DAY + 1), now, TZ)).toEqual({ kind: "none" });
    expect(planBanner(new Date(now.getTime() + 30 * DAY), now, TZ)).toEqual({ kind: "none" });
  });

  it("7 días exactos ya es expiring; menos también", () => {
    expect(planBanner(new Date(now.getTime() + 7 * DAY), now, TZ).kind).toBe("expiring");
    expect(planBanner(new Date(now.getTime() + 1000), now, TZ).kind).toBe("expiring");
  });

  it("ya pasó → expired", () => {
    expect(planBanner(new Date(now.getTime() - 1000), now, TZ).kind).toBe("expired");
    expect(planBanner(now, now, TZ).kind).toBe("expired");
  });

  it("la fecha se formatea en la timezone (dd/mm/aaaa)", () => {
    // 2026-11-25T01:00Z es todavía el 24/11 en Buenos Aires (UTC-3).
    expect(planBanner(new Date("2026-11-25T01:00:00Z"), now, TZ)).toEqual({ kind: "expiring", date: "24/11/2026" });
    expect(planBanner(new Date("2026-11-25T01:00:00Z"), now, "UTC")).toEqual({ kind: "expiring", date: "25/11/2026" });
  });

  it("mensajes del banner", () => {
    expect(planBannerMessage({ kind: "expiring", date: "24/11/2026" })).toBe("Tu plan vence el 24/11/2026.");
    expect(planBannerMessage({ kind: "expired", date: "01/11/2026" })).toBe(
      "Tu plan venció el 01/11/2026, contactá al administrador.",
    );
    expect(planBannerMessage({ kind: "none" })).toBeNull();
  });

  it("planExpiresAtFromDate guarda el final del día elegido en la timezone", () => {
    const at = planExpiresAtFromDate("2026-12-31", TZ);
    expect(at.toISOString()).toBe("2027-01-01T02:59:59.999Z");
    expect(planBanner(at, new Date("2026-12-30T12:00:00Z"), TZ)).toEqual({ kind: "expiring", date: "31/12/2026" });
    // A las 23:59 del 31/12 en Buenos Aires todavía no venció.
    expect(planBanner(at, new Date("2027-01-01T02:59:00Z"), TZ).kind).toBe("expiring");
    expect(planBanner(at, new Date("2027-01-01T03:00:00Z"), TZ).kind).toBe("expired");
  });
});

describe("platform-admin: monthRange", () => {
  it("mes de negocio en UTC y como businessDate", () => {
    expect(monthRange(new Date("2026-11-21T15:00:00Z"), TZ)).toEqual({
      start: new Date("2026-11-01T03:00:00Z"),
      end: new Date("2026-12-01T03:00:00Z"),
      startDate: "2026-11-01",
      endDate: "2026-12-01",
    });
  });

  it("borde: el 1 a las 00:30 en Buenos Aires ya es el mes nuevo, aunque el mes anterior termine 03:00 UTC", () => {
    // 2026-12-01 00:30 BA = 03:30 UTC → diciembre.
    const r = monthRange(new Date("2026-12-01T03:30:00Z"), TZ);
    expect(r.startDate).toBe("2026-12-01");
    expect(r.start.toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });

  it("borde: el 1 a la 01:00 UTC sigue siendo el mes anterior en Buenos Aires (30/11 22:00)", () => {
    const r = monthRange(new Date("2026-12-01T01:00:00Z"), TZ);
    expect(r.startDate).toBe("2026-11-01");
    expect(r.endDate).toBe("2026-12-01");
    expect(r.end.toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });

  it("diciembre pasa al año siguiente", () => {
    const r = monthRange(new Date("2026-12-15T12:00:00Z"), TZ);
    expect(r.endDate).toBe("2027-01-01");
    expect(r.end.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});

describe("platform-admin: lastActivity", () => {
  it("máximo de las fechas no null", () => {
    const a = new Date("2026-11-01T00:00:00Z");
    const b = new Date("2026-11-20T00:00:00Z");
    expect(lastActivity(a, null, b, undefined)).toEqual(b);
    expect(lastActivity(b, a)).toEqual(b);
    expect(lastActivity(null, undefined)).toBeNull();
    expect(lastActivity()).toBeNull();
  });
});

describe("platform-admin: generateAdminPassword", () => {
  it("al menos 20 caracteres y no se repite", () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generateAdminPassword()));
    expect(passwords.size).toBe(50);
    for (const p of passwords) {
      expect(p.length).toBeGreaterThanOrEqual(20);
      expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("platform-admin: defaultOpeningHours", () => {
  it("domingo cerrado y lunes a sábado de 10 a 20", () => {
    const hours = defaultOpeningHours();
    expect(hours).toHaveLength(7);
    expect(hours[0]).toEqual({ weekday: 0, opensAt: null, closesAt: null, closed: true });
    for (let weekday = 1; weekday <= 6; weekday++) {
      expect(hours[weekday]).toEqual({ weekday, opensAt: "10:00", closesAt: "20:00", closed: false });
    }
  });
});

describe("platform-admin: invitationAllowsUser (INVITE / RESET)", () => {
  const base = {
    kind: "INVITE" as const,
    barbershopId: "b1",
    barbershop: { status: "ACTIVE" as const },
    user: { barbershopId: "b1", passwordHash: null as string | null, active: true },
  };

  it("INVITE exige passwordHash null (igual que el job 017)", () => {
    expect(invitationAllowsUser(base)).toBe(true);
    expect(invitationAllowsUser({ ...base, user: { ...base.user, passwordHash: "scrypt$x$y" } })).toBe(false);
  });

  it("RESET vale aunque el usuario ya tenga contraseña", () => {
    expect(invitationAllowsUser({ ...base, kind: "RESET", user: { ...base.user, passwordHash: "scrypt$x$y" } })).toBe(true);
    expect(invitationAllowsUser({ ...base, kind: "RESET" })).toBe(true);
  });

  it("barbería suspendida → rechazo (INVITE y RESET)", () => {
    for (const kind of ["INVITE", "RESET"] as const) {
      expect(invitationAllowsUser({ ...base, kind, barbershop: { status: "SUSPENDED" } }), kind).toBe(false);
    }
  });

  it("usuario inactivo o de otra barbería → rechazo", () => {
    expect(invitationAllowsUser({ ...base, kind: "RESET", user: { ...base.user, active: false } })).toBe(false);
    expect(invitationAllowsUser({ ...base, kind: "RESET", user: { ...base.user, barbershopId: "b2" } })).toBe(false);
  });
});
