// `createBarbershop` / `updateBarbershop` contra la DB del worktree, con la sesión de admin mockeada.
// Barberías nuevas nacen con cobro activado; con cobro activado, `planExpiresAt` no se edita a mano.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/app/[slug]/data", () => ({ barbershopBrandingTag: (slug: string) => `barbershop-branding:${slug}` }));
vi.mock("@/lib/admin-auth", () => ({
  getAdminSession: vi.fn(),
  createAdminSession: vi.fn(),
  deleteAdminSession: vi.fn(),
}));

import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { billingState } from "@/lib/billing";
import { planExpiresAtFromDate } from "@/lib/platform-admin";
import { createBarbershop, updateBarbershop } from "@/server/actions/admin";

const TZ = "America/Argentina/Buenos_Aires";
const mockedSession = vi.mocked(getAdminSession);
const created: string[] = [];

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function makeShopWithOwner(billingEnabled: boolean, planExpiresAt: Date | null) {
  const suffix = randomUUID().slice(0, 12);
  const slug = `test-adm-${suffix}`;
  const ownerEmail = `owner-${suffix}@example.com`;
  const shop = await db.barbershop.create({
    data: {
      slug,
      name: "Test admin",
      timezone: TZ,
      billingEnabled,
      planExpiresAt,
      users: { create: { name: "Dueño", email: ownerEmail, role: "OWNER", passwordHash: null } },
    },
    select: { id: true },
  });
  created.push(shop.id);
  return { id: shop.id, slug, ownerEmail };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSession.mockResolvedValue({ adminId: "admin-test", admin: { id: "admin-test", email: "a@example.com", name: "Admin" } });
});

afterEach(async () => {
  const ids = created.splice(0);
  await db.invitation.deleteMany({ where: { barbershopId: { in: ids } } });
  await db.user.deleteMany({ where: { barbershopId: { in: ids } } });
  await db.barbershop.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("createBarbershop", () => {
  it("crea la barbería con billingEnabled=true y estado AWAITING_FIRST_PAYMENT", async () => {
    const suffix = randomUUID().slice(0, 12);
    const result = await createBarbershop(
      undefined,
      form({ name: "Nueva", slug: `test-new-${suffix}`, ownerName: "Dueño", ownerEmail: `new-${suffix}@example.com` }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    created.push(result.barbershopId);

    const shop = await db.barbershop.findUniqueOrThrow({
      where: { id: result.barbershopId },
      select: { billingEnabled: true, planExpiresAt: true },
    });
    expect(shop.billingEnabled).toBe(true);
    expect(billingState({ billingEnabled: shop.billingEnabled, paidUntil: shop.planExpiresAt }, new Date())).toBe(
      "AWAITING_FIRST_PAYMENT",
    );
  });
});

describe("updateBarbershop y planExpiresAt", () => {
  it("con billingEnabled=true ignora planExpiresAt", async () => {
    const paidUntil = planExpiresAtFromDate("2027-05-10", TZ);
    const shop = await makeShopWithOwner(true, paidUntil);
    const result = await updateBarbershop(
      undefined,
      form({ id: shop.id, name: "Renombrada", slug: shop.slug, ownerEmail: shop.ownerEmail, plan: "BASIC", planExpiresAt: "2030-01-01" }),
    );
    expect(result.ok).toBe(true);
    const row = await db.barbershop.findUniqueOrThrow({ where: { id: shop.id }, select: { name: true, planExpiresAt: true } });
    expect(row.name).toBe("Renombrada");
    expect(row.planExpiresAt?.toISOString()).toBe(paidUntil.toISOString());

    // Vaciar el campo tampoco lo borra.
    await updateBarbershop(
      undefined,
      form({ id: shop.id, name: "Renombrada", slug: shop.slug, ownerEmail: shop.ownerEmail, plan: "BASIC", planExpiresAt: "" }),
    );
    const again = await db.barbershop.findUniqueOrThrow({ where: { id: shop.id }, select: { planExpiresAt: true } });
    expect(again.planExpiresAt?.toISOString()).toBe(paidUntil.toISOString());
  });

  it("con billingEnabled=false la sigue guardando", async () => {
    const shop = await makeShopWithOwner(false, null);
    const result = await updateBarbershop(
      undefined,
      form({ id: shop.id, name: "Test admin", slug: shop.slug, ownerEmail: shop.ownerEmail, plan: "PRO", planExpiresAt: "2030-01-01" }),
    );
    expect(result.ok).toBe(true);
    const row = await db.barbershop.findUniqueOrThrow({ where: { id: shop.id }, select: { planExpiresAt: true } });
    expect(row.planExpiresAt?.toISOString()).toBe(planExpiresAtFromDate("2030-01-01", TZ).toISOString());
  });
});
