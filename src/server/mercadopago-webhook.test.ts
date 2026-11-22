// `@/lib/mercadopago` y `recordPayment` mockeados; las barberías van contra la DB del worktree (como billing.test.ts).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getAuthorizedPayment, getPayment, getPreapproval, type MpPayment, type MpPreapproval } from "@/lib/mercadopago";
import { MpPaymentConflictError, recordPayment } from "@/server/billing";
import { handleMpNotification } from "@/server/mercadopago-webhook";

vi.mock("@/lib/mercadopago", () => ({
  getPreapproval: vi.fn(),
  getPayment: vi.fn(),
  getAuthorizedPayment: vi.fn(),
}));

vi.mock("@/server/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/billing")>()),
  recordPayment: vi.fn(),
}));

const mockedGetPreapproval = vi.mocked(getPreapproval);
const mockedGetPayment = vi.mocked(getPayment);
const mockedGetAuthorizedPayment = vi.mocked(getAuthorizedPayment);
const mockedRecordPayment = vi.mocked(recordPayment);

const created: string[] = [];

async function makeShop(mpStatus: string | null = "authorized", monthlyAmount: string | null = null) {
  const mpPreapprovalId = `pre-${randomUUID()}`;
  const shop = await db.barbershop.create({
    data: {
      slug: `test-mpwh-${randomUUID().slice(0, 12)}`,
      name: "Test webhook",
      billingEnabled: true,
      mpPreapprovalId,
      mpStatus,
      monthlyAmount,
    },
    select: { id: true },
  });
  created.push(shop.id);
  return { id: shop.id, mpPreapprovalId };
}

async function mpStatusOf(id: string) {
  return (await db.barbershop.findUniqueOrThrow({ where: { id }, select: { mpStatus: true } })).mpStatus;
}

function payment(overrides: Partial<MpPayment> = {}): MpPayment {
  return {
    id: "111222333",
    status: "approved",
    transaction_amount: 15000,
    date_approved: "2027-03-14T12:00:00.000-03:00",
    preapprovalId: null,
    externalReference: null,
    ...overrides,
  };
}

function preapproval(overrides: Partial<MpPreapproval>): MpPreapproval {
  return {
    id: "x",
    status: "authorized",
    init_point: "https://mp.example/checkout",
    payer_email: "duenio@example.com",
    external_reference: null,
    auto_recurring: { transaction_amount: 15000, currency_id: "ARS" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRecordPayment.mockResolvedValue({ created: true, paidUntil: new Date() });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.barbershop.deleteMany({ where: { id: { in: created.splice(0) } } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("handleMpNotification: pagos", () => {
  it("payment aprobado de una barbería conocida: recordPayment una vez con el id del pago", async () => {
    const shop = await makeShop();
    mockedGetPayment.mockResolvedValueOnce(
      payment({ id: "555", transaction_amount: 15000.5, preapprovalId: shop.mpPreapprovalId }),
    );

    await expect(handleMpNotification({ type: "payment", dataId: "555" })).resolves.toBe("processed");
    expect(mockedGetPayment).toHaveBeenCalledWith("555");
    expect(mockedRecordPayment).toHaveBeenCalledTimes(1);
    expect(mockedRecordPayment).toHaveBeenCalledWith({
      barbershopId: shop.id,
      source: "MERCADOPAGO",
      months: 1,
      mpPaymentId: "555",
      amount: "15000.50",
      paidAt: new Date("2027-03-14T12:00:00.000-03:00"),
    });
  });

  it("subscription_authorized_payment: resuelve la cuota y registra con el id del pago (igual que por payment)", async () => {
    const shop = await makeShop();
    mockedGetAuthorizedPayment.mockResolvedValueOnce({
      id: "cuota-9",
      preapproval_id: shop.mpPreapprovalId,
      paymentId: "777",
      paymentStatus: "approved",
    });
    // /v1/payments no trae el preapproval: se usa el de la cuota.
    mockedGetPayment.mockResolvedValueOnce(payment({ id: "777", preapprovalId: null }));

    await expect(
      handleMpNotification({ type: "subscription_authorized_payment", dataId: "cuota-9" }),
    ).resolves.toBe("processed");
    expect(mockedGetAuthorizedPayment).toHaveBeenCalledWith("cuota-9");
    expect(mockedGetPayment).toHaveBeenCalledWith("777");
    expect(mockedRecordPayment).toHaveBeenCalledTimes(1);
    expect(mockedRecordPayment.mock.calls[0][0]).toMatchObject({ barbershopId: shop.id, mpPaymentId: "777" });

    // El mismo pago notificado por el tópico payment llega con el mismo mpPaymentId.
    mockedGetPayment.mockResolvedValueOnce(payment({ id: "777", preapprovalId: shop.mpPreapprovalId }));
    await expect(handleMpNotification({ type: "payment", dataId: "777" })).resolves.toBe("processed");
    expect(mockedRecordPayment).toHaveBeenCalledTimes(2);
    expect(mockedRecordPayment.mock.calls[1][0].mpPaymentId).toBe(mockedRecordPayment.mock.calls[0][0].mpPaymentId);
  });

  it("la cuota y el pago con preapprovals distintos: anomalía e ignored", async () => {
    const shop = await makeShop();
    mockedGetAuthorizedPayment.mockResolvedValueOnce({
      id: "cuota-2",
      preapproval_id: shop.mpPreapprovalId,
      paymentId: "888",
      paymentStatus: "approved",
    });
    mockedGetPayment.mockResolvedValueOnce(payment({ id: "888", preapprovalId: `pre-${randomUUID()}` }));
    await expect(
      handleMpNotification({ type: "subscription_authorized_payment", dataId: "cuota-2" }),
    ).resolves.toBe("ignored");
    expect(mockedRecordPayment).not.toHaveBeenCalled();
  });

  it("pago rejected: no registra y devuelve processed", async () => {
    const shop = await makeShop();
    mockedGetPayment.mockResolvedValueOnce(payment({ status: "rejected", preapprovalId: shop.mpPreapprovalId }));
    await expect(handleMpNotification({ type: "payment", dataId: "111222333" })).resolves.toBe("processed");
    expect(mockedRecordPayment).not.toHaveBeenCalled();
  });

  it("pago sin preapprovalId o de un preapproval ajeno: ignored", async () => {
    mockedGetPayment.mockResolvedValueOnce(payment({ preapprovalId: null }));
    await expect(handleMpNotification({ type: "payment", dataId: "1" })).resolves.toBe("ignored");
    mockedGetPayment.mockResolvedValueOnce(payment({ preapprovalId: `pre-${randomUUID()}` }));
    await expect(handleMpNotification({ type: "payment", dataId: "2" })).resolves.toBe("ignored");
    expect(mockedRecordPayment).not.toHaveBeenCalled();
  });

  it("cuota sin pago asociado todavía: ignored sin consultar el pago", async () => {
    const shop = await makeShop();
    mockedGetAuthorizedPayment.mockResolvedValueOnce({
      id: "cuota-1",
      preapproval_id: shop.mpPreapprovalId,
      paymentId: null,
      paymentStatus: null,
    });
    await expect(
      handleMpNotification({ type: "subscription_authorized_payment", dataId: "cuota-1" }),
    ).resolves.toBe("ignored");
    expect(mockedGetPayment).not.toHaveBeenCalled();
    expect(mockedRecordPayment).not.toHaveBeenCalled();
  });

  it("merchant_order u otro tipo: ignored sin llamar al cliente de MP", async () => {
    for (const type of ["merchant_order", "topic_claims_integration_wh", "", "point_integration_wh"]) {
      await expect(handleMpNotification({ type, dataId: "1" })).resolves.toBe("ignored");
    }
    expect(mockedGetPayment).not.toHaveBeenCalled();
    expect(mockedGetPreapproval).not.toHaveBeenCalled();
    expect(mockedGetAuthorizedPayment).not.toHaveBeenCalled();
    expect(mockedRecordPayment).not.toHaveBeenCalled();
  });

  it("si recordPayment lanza MpPaymentConflictError: lo registra como anomalía y devuelve ignored", async () => {
    const shop = await makeShop();
    mockedGetPayment.mockResolvedValueOnce(payment({ preapprovalId: shop.mpPreapprovalId }));
    mockedRecordPayment.mockRejectedValueOnce(new MpPaymentConflictError());
    await expect(handleMpNotification({ type: "payment", dataId: "111222333" })).resolves.toBe("ignored");
    expect(console.error).toHaveBeenCalled();
  });

  it("otros errores de recordPayment suben (la ruta responde 500 y MP reintenta)", async () => {
    const shop = await makeShop();
    mockedGetPayment.mockResolvedValueOnce(payment({ preapprovalId: shop.mpPreapprovalId }));
    mockedRecordPayment.mockRejectedValueOnce(new Error("db caída"));
    await expect(handleMpNotification({ type: "payment", dataId: "111222333" })).rejects.toThrow("db caída");
  });
});

describe("handleMpNotification: montos", () => {
  function amountWarns() {
    return vi.mocked(console.warn).mock.calls.filter(([message]) => String(message).includes("monto"));
  }

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("monto %s: ignored con log de anomalía, sin recordPayment", async (_label, transaction_amount) => {
    const shop = await makeShop();
    mockedGetPayment.mockResolvedValueOnce(payment({ transaction_amount, preapprovalId: shop.mpPreapprovalId }));

    await expect(handleMpNotification({ type: "payment", dataId: "111222333" })).resolves.toBe("ignored");
    expect(mockedRecordPayment).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[mp-webhook] anomalía"),
      expect.objectContaining({ paymentId: "111222333", preapprovalId: shop.mpPreapprovalId }),
    );
  });

  it("monto distinto de monthlyAmount: registra igual y avisa", async () => {
    const shop = await makeShop("authorized", "20000.00");
    mockedGetPayment.mockResolvedValueOnce(payment({ transaction_amount: 15000, preapprovalId: shop.mpPreapprovalId }));

    await expect(handleMpNotification({ type: "payment", dataId: "111222333" })).resolves.toBe("processed");
    expect(mockedRecordPayment).toHaveBeenCalledTimes(1);
    expect(mockedRecordPayment.mock.calls[0][0].amount).toBe("15000.00");
    expect(amountWarns()).toHaveLength(1);
    expect(amountWarns()[0][1]).toMatchObject({
      paymentId: "111222333",
      barbershopId: shop.id,
      amount: "15000.00",
      monthlyAmount: "20000.00",
    });
  });

  it("monto igual a monthlyAmount: sin aviso", async () => {
    const shop = await makeShop("authorized", "15000.00");
    mockedGetPayment.mockResolvedValueOnce(payment({ transaction_amount: 15000, preapprovalId: shop.mpPreapprovalId }));
    await expect(handleMpNotification({ type: "payment", dataId: "111222333" })).resolves.toBe("processed");
    expect(mockedRecordPayment).toHaveBeenCalledTimes(1);
    expect(amountWarns()).toHaveLength(0);
  });

  it("sin monthlyAmount: sin aviso", async () => {
    const shop = await makeShop("authorized", null);
    mockedGetPayment.mockResolvedValueOnce(payment({ transaction_amount: 15000, preapprovalId: shop.mpPreapprovalId }));
    await expect(handleMpNotification({ type: "payment", dataId: "111222333" })).resolves.toBe("processed");
    expect(mockedRecordPayment).toHaveBeenCalledTimes(1);
    expect(amountWarns()).toHaveLength(0);
  });
});

describe("handleMpNotification: subscription_preapproval", () => {
  it("cancelled: actualiza el mpStatus de la barbería con ese mpPreapprovalId", async () => {
    const shop = await makeShop("authorized");
    const other = await makeShop("authorized");
    mockedGetPreapproval.mockResolvedValueOnce(preapproval({ id: shop.mpPreapprovalId, status: "cancelled" }));

    await expect(
      handleMpNotification({ type: "subscription_preapproval", dataId: shop.mpPreapprovalId }),
    ).resolves.toBe("processed");
    expect(mockedGetPreapproval).toHaveBeenCalledWith(shop.mpPreapprovalId);
    expect(await mpStatusOf(shop.id)).toBe("cancelled");
    expect(await mpStatusOf(other.id)).toBe("authorized");
  });

  it("preapproval desconocido: ignored y no cambia ninguna barbería", async () => {
    const shop = await makeShop("authorized");
    mockedGetPreapproval.mockResolvedValueOnce(preapproval({ id: `pre-${randomUUID()}`, status: "cancelled" }));
    await expect(handleMpNotification({ type: "subscription_preapproval", dataId: "desconocido" })).resolves.toBe(
      "ignored",
    );
    expect(await mpStatusOf(shop.id)).toBe("authorized");
  });

  it("la barbería sale del id del recurso consultado a MP, no del id de la notificación", async () => {
    const notified = await makeShop("authorized");
    const real = await makeShop("pending");
    // La notificación trae el preapproval de `notified`, pero MP devuelve el de `real`.
    mockedGetPreapproval.mockResolvedValueOnce(preapproval({ id: real.mpPreapprovalId, status: "paused" }));
    await expect(
      handleMpNotification({ type: "subscription_preapproval", dataId: notified.mpPreapprovalId }),
    ).resolves.toBe("processed");
    expect(await mpStatusOf(real.id)).toBe("paused");
    expect(await mpStatusOf(notified.id)).toBe("authorized");
  });
});
