// Visibilidad pública según el estado de cobro, contra la DB del worktree (`DATABASE_URL` del `.env`).
// Cada test crea su barbería (slug aleatorio) y la borra al final. Sin DB, fallan: no se saltean.
// Focos de review n.º 2 (BLOCKED sigue reservando) y n.º 3 (SUSPENDED con cobro al día no entra ni se publica).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `login` importa `@/lib/auth` (server-only, cookies, redirect): se mockean para correrla en Node.
const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

import { db } from "@/lib/db";
import { billingState, type BillingState } from "@/lib/billing";
import { hashPassword } from "@/lib/password";
import { SUSPENDED_MESSAGE } from "@/lib/platform-admin";
import { createPublicBooking } from "@/server/booking";
import { getOnlineServices, getPublicBarbershop } from "@/server/queries/booking";
import { getPublicLanding, getPublicOpeningHours } from "@/server/queries/landing";
import { barbershopSlugExists } from "@/server/queries/slug-exists";
import { login } from "@/server/actions/auth";

const TZ = "America/Argentina/Buenos_Aires";
const DAY_MS = 24 * 60 * 60 * 1000;
// Miércoles 10/03/2027 09:00 en Buenos Aires. El turno es el jueves 11/03 a las 15:00 (18:00Z).
const NOW = new Date("2027-03-10T12:00:00Z");
const SLOT = "2027-03-11T18:00:00.000Z";
const created: string[] = [];

type ShopInput = { status?: "ACTIVE" | "SUSPENDED"; billingEnabled: boolean; planExpiresAt: Date | null };

async function makeShop(input: ShopInput) {
  const slug = `test-access-${randomUUID().slice(0, 12)}`;
  const shop = await db.barbershop.create({
    data: {
      slug,
      name: "Test acceso",
      timezone: TZ,
      status: input.status ?? "ACTIVE",
      billingEnabled: input.billingEnabled,
      planExpiresAt: input.planExpiresAt,
      openingHours: {
        create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: "09:00", closesAt: "20:00" })),
      },
      services: { create: { name: "Corte", price: "12000.00", durationMinutes: 30, showOnline: true } },
    },
    select: { id: true, services: { select: { id: true } } },
  });
  created.push(shop.id);
  return { id: shop.id, slug, serviceId: shop.services[0].id };
}

function stateOf(input: ShopInput): BillingState {
  return billingState({ billingEnabled: input.billingEnabled, paidUntil: input.planExpiresAt }, NOW);
}

function bookingInput(serviceId: string) {
  return { name: "Cliente Test", phone: `11${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, serviceId, startsAt: SLOT };
}

async function expectPubliclyVisible(shop: { id: string; slug: string; serviceId: string }) {
  expect(await getPublicBarbershop(shop.slug)).toMatchObject({ slug: shop.slug, name: "Test acceso" });
  expect(await barbershopSlugExists(shop.slug)).toBe(true);
  expect(await getPublicLanding(shop.slug)).not.toBeNull();
  expect(await getPublicOpeningHours(shop.slug)).toHaveLength(7);
  expect((await getOnlineServices(shop.slug)).map((s) => s.id)).toEqual([shop.serviceId]);

  const result = await createPublicBooking(shop.slug, bookingInput(shop.serviceId), NOW);
  expect(result).toMatchObject({ ok: true, startsAt: SLOT });
  const appointments = await db.appointment.findMany({ where: { barbershopId: shop.id } });
  expect(appointments).toHaveLength(1);
  expect(appointments[0].id).toBe(result.ok ? result.appointmentId : null);
  expect(appointments[0].startsAt.toISOString()).toBe(SLOT);
}

async function expectHidden(shop: { id: string; slug: string; serviceId: string }) {
  expect(await getPublicBarbershop(shop.slug)).toBeNull();
  expect(await barbershopSlugExists(shop.slug)).toBe(false);
  expect(await getPublicLanding(shop.slug)).toBeNull();
  expect(await getPublicOpeningHours(shop.slug)).toBeNull();
  expect(await getOnlineServices(shop.slug)).toEqual([]);

  const result = await createPublicBooking(shop.slug, bookingInput(shop.serviceId), NOW);
  expect(result.ok).toBe(false);
  expect(await db.appointment.count({ where: { barbershopId: shop.id } })).toBe(0);
}

beforeEach(() => {
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  cookieStore.delete.mockReset();
});

afterEach(async () => {
  const ids = created.splice(0);
  await db.appointment.deleteMany({ where: { barbershopId: { in: ids } } });
  await db.barbershop.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("visibilidad pública por estado de cobro", () => {
  it("BLOCKED (cobro vencido hace más de 12 días): sigue publicada y la reserva pública crea el turno", async () => {
    const input = { billingEnabled: true, planExpiresAt: new Date(NOW.getTime() - 20 * DAY_MS) };
    expect(stateOf(input)).toBe("BLOCKED");
    await expectPubliclyVisible(await makeShop(input));
  });

  it("AWAITING_FIRST_PAYMENT: no se publica, 404 en el proxy y la reserva se rechaza sin crear el turno", async () => {
    const input = { billingEnabled: true, planExpiresAt: null };
    expect(stateOf(input)).toBe("AWAITING_FIRST_PAYMENT");
    await expectHidden(await makeShop(input));
  });

  it("EXEMPT con planExpiresAt vencido: todo como hoy (visible y reservando)", async () => {
    const input = { billingEnabled: false, planExpiresAt: new Date(NOW.getTime() - 90 * DAY_MS) };
    expect(stateOf(input)).toBe("EXEMPT");
    await expectPubliclyVisible(await makeShop(input));
  });

  it("EXEMPT sin planExpiresAt: visible (no se confunde con AWAITING_FIRST_PAYMENT)", async () => {
    const input = { billingEnabled: false, planExpiresAt: null };
    expect(stateOf(input)).toBe("EXEMPT");
    await expectPubliclyVisible(await makeShop(input));
  });

  it("SUSPENDED con el cobro al día: sin landing, sin reservas y el login la rechaza sin crear la cookie", async () => {
    const input = {
      status: "SUSPENDED" as const,
      billingEnabled: true,
      planExpiresAt: new Date(Date.now() + 30 * DAY_MS),
    };
    expect(billingState({ billingEnabled: true, paidUntil: input.planExpiresAt }, new Date())).toBe("PAID");
    const shop = await makeShop(input);
    await expectHidden(shop);

    const email = `owner-${randomUUID().slice(0, 12)}@test.local`;
    await db.user.create({
      data: {
        barbershopId: shop.id,
        email,
        name: "Dueño",
        role: "OWNER",
        passwordHash: await hashPassword("clave-valida-123"),
      },
    });
    const form = new FormData();
    form.set("email", email);
    form.set("password", "clave-valida-123");

    expect(await login(undefined, form)).toEqual({ error: SUSPENDED_MESSAGE, email });
    expect(cookieStore.set).not.toHaveBeenCalled();
    const user = await db.user.findUniqueOrThrow({ where: { email }, select: { lastLoginAt: true } });
    expect(user.lastLoginAt).toBeNull();
  });
});
