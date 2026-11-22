import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));

import type { Session } from "@/lib/auth";
import type { BillingState } from "@/lib/billing";
import { graceBannerMessage, graceDeadline, requirePanelAccess, transferWhatsappUrl } from "@/lib/billing-access";
import { planExpiresAtFromDate } from "@/lib/platform-admin";

const TZ = "America/Argentina/Buenos_Aires";

function sessionWith(billingState: BillingState): Session {
  return {
    userId: "u1",
    barbershopId: "b1",
    role: "OWNER",
    user: { id: "u1", name: "Dueño", email: "d@example.com", role: "OWNER" },
    barbershop: {
      id: "b1",
      name: "Barbería",
      slug: "barberia",
      timezone: TZ,
      status: "ACTIVE",
      plan: "FREE",
      planExpiresAt: null,
      billingEnabled: billingState !== "EXEMPT",
      mpStatus: null,
      mpInitPoint: null,
      payerEmail: null,
      billingState,
    },
  };
}

beforeEach(() => {
  redirect.mockClear();
});

describe("requirePanelAccess", () => {
  it.each(["BLOCKED", "AWAITING_FIRST_PAYMENT"] as const)("con %s redirige a /dashboard", (state) => {
    expect(() => requirePanelAccess(sessionWith(state))).toThrow("NEXT_REDIRECT /dashboard");
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it.each(["EXEMPT", "PAID", "GRACE"] as const)("con %s no hace nada", (state) => {
    expect(() => requirePanelAccess(sessionWith(state))).not.toThrow();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("graceBannerMessage", () => {
  it("fecha límite = paidUntil + 12 días, en la timezone de la barbería", () => {
    const paidUntil = planExpiresAtFromDate("2027-03-15", TZ);
    expect(graceDeadline(paidUntil)).toEqual(new Date(paidUntil.getTime() + 12 * 24 * 60 * 60 * 1000));
    expect(graceBannerMessage(paidUntil, TZ)).toBe(
      "No pudimos cobrar tu suscripción. Tenés hasta el 27/03/2027 para regularizarla.",
    );
  });

  it("borde de medianoche: 23:59:59.999 en Buenos Aires ya es el día siguiente en UTC", () => {
    // 2027-03-15 23:59:59.999 en BA = 2027-03-16T02:59:59.999Z → límite 27/03 en BA (28/03 en UTC).
    const paidUntil = new Date("2027-03-16T02:59:59.999Z");
    expect(graceBannerMessage(paidUntil, TZ)).toContain("hasta el 27/03/2027 ");
    expect(graceBannerMessage(paidUntil, "UTC")).toContain("hasta el 28/03/2027 ");
    // Un milisegundo después ya es el 16 en BA → límite 28/03.
    expect(graceBannerMessage(new Date("2027-03-16T03:00:00.000Z"), TZ)).toContain("hasta el 28/03/2027 ");
  });
});

describe("transferWhatsappUrl", () => {
  it("apunta a contactWhatsapp (solo dígitos) con el texto codificado", () => {
    const url = transferWhatsappUrl("+54 9 11 2345-6789", "Barbería Don José & Hijos");
    expect(url).toBe(
      `https://wa.me/5491123456789?text=${encodeURIComponent("Hola, ya transferí la suscripción de Barbería Don José & Hijos")}`,
    );
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("text")).toBe("Hola, ya transferí la suscripción de Barbería Don José & Hijos");
  });

  it("sin número (o sin dígitos) → null", () => {
    expect(transferWhatsappUrl(null, "X")).toBeNull();
    expect(transferWhatsappUrl("", "X")).toBeNull();
    expect(transferWhatsappUrl("---", "X")).toBeNull();
  });
});
