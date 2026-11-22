// Acciones de cobro del admin contra la DB del worktree (`DATABASE_URL` del `.env`), con `@/lib/mercadopago` y
// la sesión de admin mockeados. Cada test crea su barbería (slug aleatorio) y la borra al final.
// Foco de review n.º 5: si MP falla al cancelar, no cambia nada local.
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
vi.mock("@/lib/admin-auth", () => ({ getAdminSession: vi.fn() }));
vi.mock("@/lib/mercadopago", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mercadopago")>();
  return {
    MpError: actual.MpError,
    createPreapproval: vi.fn(),
    updatePreapprovalAmount: vi.fn(),
    cancelPreapproval: vi.fn(),
    getPreapproval: vi.fn(),
  };
});

import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { billingState } from "@/lib/billing";
import { businessDate } from "@/lib/time";
import { addDays } from "@/lib/slots";
import {
  cancelPreapproval,
  createPreapproval,
  MpError,
  updatePreapprovalAmount,
  type MpPreapproval,
} from "@/lib/mercadopago";
import {
  changeSubscriptionAmount,
  generateSubscriptionLink,
  markDuplicateReviewed,
  registerManualPayment,
  setBillingEnabled,
  updatePlatformSettings,
} from "@/server/actions/admin-billing";

const TZ = "America/Argentina/Buenos_Aires";
const ADMIN_ID = `admin-${randomUUID()}`;
const MP_SECRET_TEXT = "Mercado Pago respondió 500 (PUT /preapproval/secret-id)";

const mockedSession = vi.mocked(getAdminSession);
const mockedCancel = vi.mocked(cancelPreapproval);
const mockedCreate = vi.mocked(createPreapproval);
const mockedUpdateAmount = vi.mocked(updatePreapprovalAmount);
const created: string[] = [];

type ShopInput = {
  billingEnabled?: boolean;
  planExpiresAt?: Date | null;
  mpPreapprovalId?: string | null;
  mpStatus?: string | null;
  monthlyAmount?: string | null;
  payerEmail?: string | null;
  mpInitPoint?: string | null;
};

async function makeShop(input: ShopInput = {}) {
  const slug = `test-admbill-${randomUUID().slice(0, 12)}`;
  const shop = await db.barbershop.create({
    data: {
      slug,
      name: "Test cobro admin",
      timezone: TZ,
      billingEnabled: input.billingEnabled ?? true,
      planExpiresAt: input.planExpiresAt ?? null,
      mpPreapprovalId: input.mpPreapprovalId ?? null,
      mpStatus: input.mpStatus ?? null,
      monthlyAmount: input.monthlyAmount ?? null,
      payerEmail: input.payerEmail ?? null,
      mpInitPoint: input.mpInitPoint ?? null,
    },
    select: { id: true },
  });
  created.push(shop.id);
  return { id: shop.id, slug };
}

async function shopRow(id: string) {
  return db.barbershop.findUniqueOrThrow({
    where: { id },
    select: {
      billingEnabled: true,
      planExpiresAt: true,
      mpPreapprovalId: true,
      mpInitPoint: true,
      mpStatus: true,
      monthlyAmount: true,
      payerEmail: true,
      updatedAt: true,
    },
  });
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function preapproval(overrides: Partial<MpPreapproval> = {}): MpPreapproval {
  return {
    id: `pre-new-${randomUUID()}`,
    status: "pending",
    init_point: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=nuevo",
    payer_email: "pagador@example.com",
    external_reference: null,
    auto_recurring: { transaction_amount: 18000, currency_id: "ARS" },
    ...overrides,
  };
}

function expectGenericError(result: { ok: boolean; error?: string }) {
  expect(result.ok).toBe(false);
  expect(result.error).toBeTruthy();
  expect(result.error).not.toContain(MP_SECRET_TEXT);
  expect(result.error).not.toContain("500");
  expect(result.error).not.toContain("secret-id");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSession.mockResolvedValue({ adminId: ADMIN_ID, admin: { id: ADMIN_ID, email: "admin@example.com", name: "Admin" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  const ids = created.splice(0);
  await db.subscriptionPayment.deleteMany({ where: { barbershopId: { in: ids } } });
  await db.barbershop.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------------------------------------------

describe("setBillingEnabled (foco n.º 5)", () => {
  it("desactivar con cancelPreapproval que lanza MpError: error genérico y no cambia nada", async () => {
    const shop = await makeShop({ mpPreapprovalId: `pre-${randomUUID()}`, mpStatus: "authorized" });
    mockedCancel.mockRejectedValue(new MpError(500, MP_SECRET_TEXT));

    const result = await setBillingEnabled(undefined, form({ id: shop.id, enabled: "0" }));

    expectGenericError(result);
    expect(mockedCancel).toHaveBeenCalledTimes(1);
    const row = await shopRow(shop.id);
    expect(row.billingEnabled).toBe(true);
    expect(row.mpStatus).toBe("authorized");
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("desactivar con cancelPreapproval que resuelve: billingEnabled=false y mpStatus=cancelled", async () => {
    const preId = `pre-${randomUUID()}`;
    const shop = await makeShop({ mpPreapprovalId: preId, mpStatus: "authorized" });
    mockedCancel.mockResolvedValue(preapproval({ id: preId, status: "cancelled" }));

    const result = await setBillingEnabled(undefined, form({ id: shop.id, enabled: "0" }));

    expect(result.ok).toBe(true);
    expect(mockedCancel).toHaveBeenCalledWith(preId);
    const row = await shopRow(shop.id);
    expect(row.billingEnabled).toBe(false);
    expect(row.mpStatus).toBe("cancelled");
    expect(updateTag).toHaveBeenCalledWith(`barbershop-branding:${shop.slug}`);
  });

  it("desactivar con el preapproval ya cancelado no llama a MP", async () => {
    const shop = await makeShop({ mpPreapprovalId: `pre-${randomUUID()}`, mpStatus: "cancelled" });
    const result = await setBillingEnabled(undefined, form({ id: shop.id, enabled: "0" }));
    expect(result.ok).toBe(true);
    expect(mockedCancel).not.toHaveBeenCalled();
    expect((await shopRow(shop.id)).billingEnabled).toBe(false);
  });

  it("activar sin planExpiresAt exige confirm=1", async () => {
    const shop = await makeShop({ billingEnabled: false, planExpiresAt: null });

    const denied = await setBillingEnabled(undefined, form({ id: shop.id, enabled: "1" }));
    expect(denied.ok).toBe(false);
    expect((await shopRow(shop.id)).billingEnabled).toBe(false);
    expect(updateTag).not.toHaveBeenCalled();

    const ok = await setBillingEnabled(undefined, form({ id: shop.id, enabled: "1", confirm: "1" }));
    expect(ok.ok).toBe(true);
    const row = await shopRow(shop.id);
    expect(row.billingEnabled).toBe(true);
    expect(billingState({ billingEnabled: row.billingEnabled, paidUntil: row.planExpiresAt }, new Date())).toBe(
      "AWAITING_FIRST_PAYMENT",
    );
    expect(updateTag).toHaveBeenCalledWith(`barbershop-branding:${shop.slug}`);
  });

  it("activar con planExpiresAt futuro no pide confirmación", async () => {
    const shop = await makeShop({ billingEnabled: false, planExpiresAt: new Date(Date.now() + 10 * 86_400_000) });
    const result = await setBillingEnabled(undefined, form({ id: shop.id, enabled: "1" }));
    expect(result.ok).toBe(true);
    expect((await shopRow(shop.id)).billingEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("generateSubscriptionLink", () => {
  it("con un preapproval previo no cancelado: cancela el viejo antes de crear y guarda el nuevo", async () => {
    const oldId = `pre-old-${randomUUID()}`;
    const shop = await makeShop({
      mpPreapprovalId: oldId,
      mpStatus: "pending",
      monthlyAmount: "15000",
      payerEmail: "viejo@example.com",
      mpInitPoint: "https://www.mercadopago.com.ar/viejo",
    });
    const fresh = preapproval();
    mockedCancel.mockResolvedValue(preapproval({ id: oldId, status: "cancelled" }));
    mockedCreate.mockResolvedValue(fresh);

    const result = await generateSubscriptionLink(
      undefined,
      form({ id: shop.id, amount: "18000.50", payerEmail: "Pagador@Example.com" }),
    );

    expect(result.ok).toBe(true);
    expect(mockedCancel).toHaveBeenCalledWith(oldId);
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ barbershopId: shop.id, payerEmail: "pagador@example.com", amount: "18000.50" }),
    );
    expect(mockedCancel.mock.invocationCallOrder[0]).toBeLessThan(mockedCreate.mock.invocationCallOrder[0]);
    const row = await shopRow(shop.id);
    expect(row).toMatchObject({
      mpPreapprovalId: fresh.id,
      mpInitPoint: fresh.init_point,
      mpStatus: "pending",
      payerEmail: "pagador@example.com",
    });
    expect(row.monthlyAmount?.toString()).toBe("18000.5");
  });

  it("si cancelPreapproval lanza, no se crea nada y la barbería no cambia", async () => {
    const oldId = `pre-old-${randomUUID()}`;
    const shop = await makeShop({ mpPreapprovalId: oldId, mpStatus: "authorized", monthlyAmount: "15000", payerEmail: "viejo@example.com" });
    const before = await shopRow(shop.id);
    mockedCancel.mockRejectedValue(new MpError(500, MP_SECRET_TEXT));

    const result = await generateSubscriptionLink(undefined, form({ id: shop.id, amount: "18000", payerEmail: "nuevo@example.com" }));

    expectGenericError(result);
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(await shopRow(shop.id)).toEqual(before);
  });

  it("si el create falla después de cancelar, queda mpStatus=cancelled", async () => {
    const oldId = `pre-old-${randomUUID()}`;
    const shop = await makeShop({ mpPreapprovalId: oldId, mpStatus: "authorized" });
    mockedCancel.mockResolvedValue(preapproval({ id: oldId, status: "cancelled" }));
    mockedCreate.mockRejectedValue(new MpError(400, MP_SECRET_TEXT));

    const result = await generateSubscriptionLink(undefined, form({ id: shop.id, amount: "18000", payerEmail: "nuevo@example.com" }));

    expectGenericError(result);
    const row = await shopRow(shop.id);
    expect(row.mpPreapprovalId).toBe(oldId);
    expect(row.mpStatus).toBe("cancelled");
  });

  it("sin preapproval previo crea directamente", async () => {
    const shop = await makeShop();
    mockedCreate.mockResolvedValue(preapproval());
    const result = await generateSubscriptionLink(undefined, form({ id: shop.id, amount: "15000", payerEmail: "a@example.com" }));
    expect(result.ok).toBe(true);
    expect(mockedCancel).not.toHaveBeenCalled();
  });

  it("con el cobro desactivado no llama a MP", async () => {
    const shop = await makeShop({ billingEnabled: false });
    const result = await generateSubscriptionLink(undefined, form({ id: shop.id, amount: "15000", payerEmail: "a@example.com" }));
    expect(result.ok).toBe(false);
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe("generateSubscriptionLink: carreras (028)", () => {
  it("otra pestaña guarda otro preapproval mientras se crea: ok:false, se cancela el nuevo y queda el de la otra", async () => {
    const oldId = `pre-old-${randomUUID()}`;
    const otherTabId = `pre-other-${randomUUID()}`;
    const shop = await makeShop({ mpPreapprovalId: oldId, mpStatus: "authorized" });
    const fresh = preapproval();
    mockedCancel.mockResolvedValue(preapproval({ status: "cancelled" }));
    mockedCreate.mockImplementation(async () => {
      await db.barbershop.update({ where: { id: shop.id }, data: { mpPreapprovalId: otherTabId, mpStatus: "pending" } });
      return fresh;
    });

    const result = await generateSubscriptionLink(undefined, form({ id: shop.id, amount: "18000", payerEmail: "a@example.com" }));

    expectGenericError(result);
    expect(result.ok === false && result.error).toContain("Recargá");
    expect(mockedCancel).toHaveBeenNthCalledWith(1, oldId);
    expect(mockedCancel).toHaveBeenLastCalledWith(fresh.id);
    const row = await shopRow(shop.id);
    expect(row.mpPreapprovalId).toBe(otherTabId);
    expect(row.mpStatus).toBe("pending");
    expect(console.error).toHaveBeenCalled();
  });

  it("se desactiva el cobro mientras se crea: se cancela el nuevo y no queda guardado", async () => {
    const shop = await makeShop();
    const fresh = preapproval();
    mockedCancel.mockResolvedValue(preapproval({ id: fresh.id, status: "cancelled" }));
    mockedCreate.mockImplementation(async () => {
      await db.barbershop.update({ where: { id: shop.id }, data: { billingEnabled: false } });
      return fresh;
    });

    const result = await generateSubscriptionLink(undefined, form({ id: shop.id, amount: "18000", payerEmail: "a@example.com" }));

    expect(result.ok).toBe(false);
    expect(mockedCancel).toHaveBeenCalledTimes(1);
    expect(mockedCancel).toHaveBeenCalledWith(fresh.id);
    const row = await shopRow(shop.id);
    expect(row.billingEnabled).toBe(false);
    expect(row.mpPreapprovalId).toBeNull();
    expect(row.mpInitPoint).toBeNull();
  });

  it("si la cancelación compensatoria también falla, el log lleva el id del preapproval nuevo", async () => {
    const shop = await makeShop();
    const fresh = preapproval();
    mockedCancel.mockRejectedValue(new MpError(500, MP_SECRET_TEXT));
    mockedCreate.mockImplementation(async () => {
      await db.barbershop.update({ where: { id: shop.id }, data: { billingEnabled: false } });
      return fresh;
    });

    const result = await generateSubscriptionLink(undefined, form({ id: shop.id, amount: "18000", payerEmail: "a@example.com" }));

    expectGenericError(result);
    const logged = vi.mocked(console.error).mock.calls.map(([message]) => String(message));
    expect(logged.some((message) => message.includes(fresh.id) && message.includes("cancelPreapproval"))).toBe(true);
  });

  it("create falla y el update del rollback también: resuelve con el error de MP y loguea", async () => {
    const oldId = `pre-old-${randomUUID()}`;
    const shop = await makeShop({ mpPreapprovalId: oldId, mpStatus: "authorized" });
    mockedCancel.mockResolvedValue(preapproval({ id: oldId, status: "cancelled" }));
    mockedCreate.mockRejectedValue(new MpError(400, MP_SECRET_TEXT));
    vi.spyOn(db.barbershop, "updateMany").mockRejectedValueOnce(new Error("db caída"));

    const result = await generateSubscriptionLink(undefined, form({ id: shop.id, amount: "18000", payerEmail: "a@example.com" }));

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Cancelamos la suscripción anterior") });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(oldId), expect.any(Error));
  });
});

describe("setBillingEnabled: carrera al desactivar (028)", () => {
  it("si el mpPreapprovalId cambia mientras se cancela en MP: ok:false y el cobro sigue activado", async () => {
    const preId = `pre-${randomUUID()}`;
    const otherTabId = `pre-other-${randomUUID()}`;
    const shop = await makeShop({ mpPreapprovalId: preId, mpStatus: "authorized" });
    mockedCancel.mockImplementation(async () => {
      await db.barbershop.update({ where: { id: shop.id }, data: { mpPreapprovalId: otherTabId, mpStatus: "pending" } });
      return preapproval({ id: preId, status: "cancelled" });
    });

    const result = await setBillingEnabled(undefined, form({ id: shop.id, enabled: "0" }));

    expectGenericError(result);
    expect(mockedCancel).toHaveBeenCalledWith(preId);
    const row = await shopRow(shop.id);
    expect(row.billingEnabled).toBe(true);
    expect(row.mpPreapprovalId).toBe(otherTabId);
    expect(row.mpStatus).toBe("pending");
    expect(updateTag).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("values en los errores (028)", () => {
  it("generateSubscriptionLink con monto inválido devuelve lo enviado", async () => {
    const shop = await makeShop();
    const result = await generateSubscriptionLink(
      undefined,
      form({ id: shop.id, amount: "abc", payerEmail: "Duenio@Example.com" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.amount).toBeTruthy();
    expect(result.values).toEqual({ amount: "abc", payerEmail: "Duenio@Example.com" });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("generateSubscriptionLink con MP fallando devuelve lo enviado", async () => {
    const shop = await makeShop();
    mockedCreate.mockRejectedValue(new MpError(500, MP_SECRET_TEXT));
    const result = await generateSubscriptionLink(undefined, form({ id: shop.id, amount: "18000", payerEmail: "a@example.com" }));
    expect(result).toMatchObject({ ok: false, values: { amount: "18000", payerEmail: "a@example.com" } });
  });

  it("changeSubscriptionAmount con MP fallando devuelve el monto enviado", async () => {
    const shop = await makeShop({ mpPreapprovalId: `pre-${randomUUID()}`, mpStatus: "authorized" });
    mockedUpdateAmount.mockRejectedValue(new MpError(500, MP_SECRET_TEXT));
    const result = await changeSubscriptionAmount(undefined, form({ id: shop.id, amount: "21000" }));
    expect(result).toMatchObject({ ok: false, values: { amount: "21000" } });
  });

  it("registerManualPayment con el registro fallando devuelve note y months enviados", async () => {
    const shop = await makeShop();
    const today = businessDate(new Date(), TZ);
    vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("db caída"));
    const result = await registerManualPayment(
      undefined,
      form({ id: shop.id, amount: "15000", paidAt: today, months: "3", note: "Transferencia de marzo" }),
    );
    expect(result).toMatchObject({
      ok: false,
      values: { amount: "15000", paidAt: today, months: "3", note: "Transferencia de marzo" },
    });
    expect(await db.subscriptionPayment.count({ where: { barbershopId: shop.id } })).toBe(0);
  });

  it("registerManualPayment con fecha futura devuelve lo enviado", async () => {
    const shop = await makeShop();
    const tomorrow = addDays(businessDate(new Date(), TZ), 1);
    const result = await registerManualPayment(
      undefined,
      form({ id: shop.id, amount: "15000", paidAt: tomorrow, months: "2", note: "x" }),
    );
    expect(result).toMatchObject({ ok: false, values: { paidAt: tomorrow, months: "2", note: "x" } });
  });
});

describe("changeSubscriptionAmount", () => {
  it("con updatePreapprovalAmount que lanza, monthlyAmount no cambia", async () => {
    const preId = `pre-${randomUUID()}`;
    const shop = await makeShop({ mpPreapprovalId: preId, mpStatus: "authorized", monthlyAmount: "15000" });
    mockedUpdateAmount.mockRejectedValue(new MpError(500, MP_SECRET_TEXT));

    const result = await changeSubscriptionAmount(undefined, form({ id: shop.id, amount: "20000" }));

    expectGenericError(result);
    expect(mockedUpdateAmount).toHaveBeenCalledWith(preId, "20000");
    expect((await shopRow(shop.id)).monthlyAmount?.toString()).toBe("15000");
  });

  it("con MP ok actualiza el monto", async () => {
    const preId = `pre-${randomUUID()}`;
    const shop = await makeShop({ mpPreapprovalId: preId, mpStatus: "authorized", monthlyAmount: "15000" });
    mockedUpdateAmount.mockResolvedValue(preapproval({ id: preId, status: "authorized" }));
    const result = await changeSubscriptionAmount(undefined, form({ id: shop.id, amount: "20000" }));
    expect(result.ok).toBe(true);
    expect((await shopRow(shop.id)).monthlyAmount?.toString()).toBe("20000");
  });

  it("sin preapproval solo guarda el monto", async () => {
    const shop = await makeShop();
    const result = await changeSubscriptionAmount(undefined, form({ id: shop.id, amount: "12500.75" }));
    expect(result.ok).toBe(true);
    expect(mockedUpdateAmount).not.toHaveBeenCalled();
    expect((await shopRow(shop.id)).monthlyAmount?.toString()).toBe("12500.75");
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("registerManualPayment", () => {
  it("AWAITING_FIRST_PAYMENT → PAID, con source=MANUAL, admin de la sesión y los meses pedidos, sin MP", async () => {
    const shop = await makeShop({ billingEnabled: true, planExpiresAt: null });
    const today = businessDate(new Date(), TZ);

    const result = await registerManualPayment(
      undefined,
      form({ id: shop.id, amount: "15000", paidAt: today, months: "3", note: "Transferencia de marzo" }),
    );

    expect(result.ok).toBe(true);
    const payments = await db.subscriptionPayment.findMany({ where: { barbershopId: shop.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ source: "MANUAL", createdByAdminId: ADMIN_ID, note: "Transferencia de marzo" });
    expect(payments[0].amount.toString()).toBe("15000");
    // 3 meses calendario desde hoy.
    const coversUntil = businessDate(payments[0].coversUntil, TZ);
    const [y, m] = today.split("-").map(Number);
    const total = y * 12 + (m - 1) + 3;
    expect(coversUntil.slice(0, 7)).toBe(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);

    const row = await shopRow(shop.id);
    expect(billingState({ billingEnabled: row.billingEnabled, paidUntil: row.planExpiresAt }, new Date())).toBe("PAID");
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedCancel).not.toHaveBeenCalled();
    expect(mockedUpdateAmount).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledWith(`barbershop-branding:${shop.slug}`);
  });

  it("con paidAt futuro devuelve error y no crea el pago", async () => {
    const shop = await makeShop({ billingEnabled: true });
    const tomorrow = addDays(businessDate(new Date(), TZ), 1);
    const result = await registerManualPayment(undefined, form({ id: shop.id, amount: "15000", paidAt: tomorrow }));
    expect(result.ok).toBe(false);
    expect(await db.subscriptionPayment.count({ where: { barbershopId: shop.id } })).toBe(0);
    expect((await shopRow(shop.id)).planExpiresAt).toBeNull();
  });

  it("con billingEnabled=false devuelve error y no crea el pago", async () => {
    const shop = await makeShop({ billingEnabled: false });
    const result = await registerManualPayment(
      undefined,
      form({ id: shop.id, amount: "15000", paidAt: businessDate(new Date(), TZ) }),
    );
    expect(result.ok).toBe(false);
    expect(await db.subscriptionPayment.count({ where: { barbershopId: shop.id } })).toBe(0);
  });
});

describe("markDuplicateReviewed", () => {
  async function duplicatePayment(barbershopId: string) {
    return db.subscriptionPayment.create({
      data: {
        barbershopId,
        source: "MERCADOPAGO",
        amount: "15000",
        paidAt: new Date(),
        coversUntil: new Date(Date.now() + 30 * 86_400_000),
        mpPaymentId: `pay-${randomUUID()}`,
        suspectedDuplicate: true,
      },
      select: { id: true },
    });
  }

  it("marca el pago de la misma barbería", async () => {
    const shop = await makeShop();
    const payment = await duplicatePayment(shop.id);
    const result = await markDuplicateReviewed(undefined, form({ id: shop.id, paymentId: payment.id }));
    expect(result.ok).toBe(true);
    const row = await db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(row.duplicateReviewedAt).not.toBeNull();
  });

  it("con un paymentId de otra barbería no lo modifica", async () => {
    const mine = await makeShop();
    const other = await makeShop();
    const payment = await duplicatePayment(other.id);
    const result = await markDuplicateReviewed(undefined, form({ id: mine.id, paymentId: payment.id }));
    expect(result.ok).toBe(false);
    const row = await db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(row.duplicateReviewedAt).toBeNull();
  });
});

describe("updatePlatformSettings", () => {
  it("upsert de la fila singleton con vacíos → null", async () => {
    const before = await db.platformSettings.findUnique({ where: { id: "singleton" } });
    try {
      const result = await updatePlatformSettings(
        undefined,
        form({ transferAlias: " barber.app ", transferCbu: "0000003100012345678901", transferHolder: "", contactWhatsapp: "+54 9 11 1234-5678" }),
      );
      expect(result.ok).toBe(true);
      expect(await db.platformSettings.findUniqueOrThrow({ where: { id: "singleton" } })).toMatchObject({
        transferAlias: "barber.app",
        transferCbu: "0000003100012345678901",
        transferHolder: null,
        contactWhatsapp: "+54 9 11 1234-5678",
      });

      const invalid = await updatePlatformSettings(undefined, form({ transferCbu: "123" }));
      expect(invalid.ok).toBe(false);
    } finally {
      if (before) {
        await db.platformSettings.update({
          where: { id: "singleton" },
          data: {
            transferAlias: before.transferAlias,
            transferCbu: before.transferCbu,
            transferHolder: before.transferHolder,
            contactWhatsapp: before.contactWhatsapp,
          },
        });
      } else {
        await db.platformSettings.deleteMany({ where: { id: "singleton" } });
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("sin sesión de admin", () => {
  it("las seis acciones devuelven ok:false y no tocan ni la DB ni MP", async () => {
    mockedSession.mockResolvedValue(null);
    const preId = `pre-${randomUUID()}`;
    const shop = await makeShop({ mpPreapprovalId: preId, mpStatus: "authorized", monthlyAmount: "15000" });
    const payment = await db.subscriptionPayment.create({
      data: {
        barbershopId: shop.id,
        source: "MERCADOPAGO",
        amount: "15000",
        paidAt: new Date(),
        coversUntil: new Date(),
        mpPaymentId: `pay-${randomUUID()}`,
        suspectedDuplicate: true,
      },
      select: { id: true },
    });
    const shopBefore = await shopRow(shop.id);
    const settingsBefore = await db.platformSettings.findUnique({ where: { id: "singleton" } });
    const today = businessDate(new Date(), TZ);

    const results = await Promise.all([
      generateSubscriptionLink(undefined, form({ id: shop.id, amount: "18000", payerEmail: "x@example.com" })),
      changeSubscriptionAmount(undefined, form({ id: shop.id, amount: "18000" })),
      setBillingEnabled(undefined, form({ id: shop.id, enabled: "0" })),
      registerManualPayment(undefined, form({ id: shop.id, amount: "15000", paidAt: today })),
      markDuplicateReviewed(undefined, form({ id: shop.id, paymentId: payment.id })),
      updatePlatformSettings(undefined, form({ transferAlias: "hackeado" })),
    ]);

    for (const result of results) expect(result.ok).toBe(false);
    expect(mockedSession).toHaveBeenCalledTimes(6);
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedCancel).not.toHaveBeenCalled();
    expect(mockedUpdateAmount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
    expect(await shopRow(shop.id)).toEqual(shopBefore);
    expect(await db.subscriptionPayment.count({ where: { barbershopId: shop.id } })).toBe(1);
    expect((await db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } })).duplicateReviewedAt).toBeNull();
    expect(await db.platformSettings.findUnique({ where: { id: "singleton" } })).toEqual(settingsBefore);
  });
});
