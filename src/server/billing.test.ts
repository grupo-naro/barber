// Tests contra la DB del worktree (`DATABASE_URL` del `.env`). Cada test crea su propia barbería y la borra
// al final (los pagos se van en cascada). Sin DB, fallan: no se saltean.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { planExpiresAtFromDate } from "@/lib/platform-admin";
import { MpPaymentConflictError, recordPayment } from "@/server/billing";

const TZ = "America/Argentina/Buenos_Aires";
const DAY_MS = 24 * 60 * 60 * 1000;
const created: string[] = [];

async function makeShop(planExpiresAt: Date | null) {
  const shop = await db.barbershop.create({
    data: {
      slug: `test-billing-${randomUUID().slice(0, 12)}`,
      name: "Test billing",
      timezone: TZ,
      billingEnabled: true,
      planExpiresAt,
    },
    select: { id: true },
  });
  created.push(shop.id);
  return shop.id;
}

async function paidUntilOf(id: string) {
  const shop = await db.barbershop.findUniqueOrThrow({ where: { id }, select: { planExpiresAt: true } });
  return shop.planExpiresAt;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await db.barbershop.deleteMany({ where: { id: { in: created.splice(0) } } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("recordPayment", () => {
  it("el mismo mpPaymentId en paralelo: un solo pago y una sola extensión; repetido después, no cambia nada", async () => {
    const id = await makeShop(planExpiresAtFromDate("2027-03-15", TZ));
    const mpPaymentId = `test-${randomUUID()}`;
    const call = () =>
      recordPayment({
        barbershopId: id,
        source: "MERCADOPAGO",
        amount: "15000.50",
        paidAt: new Date("2027-03-14T15:00:00Z"),
        months: 1,
        mpPaymentId,
      });

    const results = await Promise.all([call(), call()]);
    expect(results.map((r) => r.created).sort()).toEqual([false, true]);
    const expected = planExpiresAtFromDate("2027-04-15", TZ);
    for (const r of results) expect(r.paidUntil).toEqual(expected);

    const payments = await db.subscriptionPayment.findMany({ where: { mpPaymentId } });
    expect(payments).toHaveLength(1);
    expect(payments[0].amount.toString()).toBe("15000.5");
    expect(payments[0].coversUntil).toEqual(expected);
    expect(payments[0].source).toBe("MERCADOPAGO");
    expect(await paidUntilOf(id)).toEqual(expected);

    const third = await call();
    expect(third).toEqual({ created: false, paidUntil: expected });
    expect(await db.subscriptionPayment.count({ where: { barbershopId: id } })).toBe(1);
    expect(await paidUntilOf(id)).toEqual(expected);
  });

  it("si el chequeo previo no lo ve y la inserción choca con P2002: created false y el período no se extiende", async () => {
    const id = await makeShop(null);
    const mpPaymentId = `test-${randomUUID()}`;
    const input = {
      barbershopId: id,
      source: "MERCADOPAGO" as const,
      amount: "15000",
      paidAt: new Date("2027-05-02T15:00:00Z"),
      months: 1,
      mpPaymentId,
    };
    const first = await recordPayment(input);
    expect(first.created).toBe(true);

    // Simula la carrera: dentro de la transacción, el `findUnique` por `mpPaymentId` no encuentra nada.
    const original = db.$transaction.bind(db) as (...args: unknown[]) => Promise<unknown>;
    const spy = vi.spyOn(db, "$transaction").mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>, opts: unknown) =>
      original((tx: Record<string, unknown>) => {
        const payments = tx.subscriptionPayment as Record<string, unknown>;
        const blind = new Proxy(payments, {
          get: (target, prop) =>
            prop === "findUnique" ? async () => null : Reflect.get(target, prop),
        });
        return fn(new Proxy(tx, { get: (t, p) => (p === "subscriptionPayment" ? blind : Reflect.get(t, p)) }));
      }, opts)) as never);

    const second = await recordPayment(input);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ created: false, paidUntil: first.paidUntil });
    expect(await db.subscriptionPayment.count({ where: { barbershopId: id } })).toBe(1);
    expect(await paidUntilOf(id)).toEqual(first.paidUntil);
  });

  it("el mismo mpPaymentId en otra barbería rechaza con MpPaymentConflictError y no toca la barbería B", async () => {
    const a = await makeShop(planExpiresAtFromDate("2027-03-15", TZ));
    const b = await makeShop(planExpiresAtFromDate("2027-06-01", TZ));
    const mpPaymentId = `test-${randomUUID()}`;
    const input = (barbershopId: string) => ({
      barbershopId,
      source: "MERCADOPAGO" as const,
      amount: "15000",
      paidAt: new Date("2027-03-14T15:00:00Z"),
      months: 1,
      mpPaymentId,
    });
    const first = await recordPayment(input(a));
    expect(first.created).toBe(true);

    const error = await recordPayment(input(b)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MpPaymentConflictError);
    const message = (error as Error).message;
    expect(message).not.toContain(a);
    expect(message).not.toContain(b);
    expect(message).not.toContain("15000");

    expect(await paidUntilOf(b)).toEqual(planExpiresAtFromDate("2027-06-01", TZ));
    expect(await db.subscriptionPayment.count({ where: { barbershopId: b } })).toBe(0);

    // La misma llamada con A sigue siendo idempotente.
    expect(await recordPayment(input(a))).toEqual({ created: false, paidUntil: first.paidUntil });
    expect(await db.subscriptionPayment.count({ where: { barbershopId: a } })).toBe(1);
  });

  it("si el pago de otra barbería se ve recién por P2002, el fallback también rechaza y no devuelve su coversUntil", async () => {
    const a = await makeShop(null);
    const b = await makeShop(null);
    const mpPaymentId = `test-${randomUUID()}`;
    const input = (barbershopId: string) => ({
      barbershopId,
      source: "MERCADOPAGO" as const,
      amount: "15000",
      paidAt: new Date("2027-05-02T15:00:00Z"),
      months: 1,
      mpPaymentId,
    });
    expect((await recordPayment(input(a))).created).toBe(true);

    const original = db.$transaction.bind(db) as (...args: unknown[]) => Promise<unknown>;
    vi.spyOn(db, "$transaction").mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>, opts: unknown) =>
      original((tx: Record<string, unknown>) => {
        const payments = tx.subscriptionPayment as Record<string, unknown>;
        const blind = new Proxy(payments, {
          get: (target, prop) =>
            prop === "findUnique" ? async () => null : Reflect.get(target, prop),
        });
        return fn(new Proxy(tx, { get: (t, p) => (p === "subscriptionPayment" ? blind : Reflect.get(t, p)) }));
      }, opts)) as never);

    await expect(recordPayment(input(b))).rejects.toBeInstanceOf(MpPaymentConflictError);
    expect(await paidUntilOf(b)).toBeNull();
    expect(await db.subscriptionPayment.count({ where: { barbershopId: b } })).toBe(0);
  });

  it("un pago MANUAL de 2 meses extiende 2 meses y guarda nota y admin", async () => {
    const id = await makeShop(null);
    const result = await recordPayment({
      barbershopId: id,
      source: "MANUAL",
      amount: "30000",
      paidAt: new Date("2027-05-02T15:00:00Z"),
      months: 2,
      note: "Transferencia de mayo y junio",
      createdByAdminId: "admin-test",
    });
    const expected = planExpiresAtFromDate("2027-07-02", TZ);
    expect(result).toEqual({ created: true, paidUntil: expected });
    expect(await paidUntilOf(id)).toEqual(expected);

    const [payment] = await db.subscriptionPayment.findMany({ where: { barbershopId: id } });
    expect(payment.source).toBe("MANUAL");
    expect(payment.mpPaymentId).toBeNull();
    expect(payment.note).toBe("Transferencia de mayo y junio");
    expect(payment.createdByAdminId).toBe("admin-test");
    expect(payment.amount.toString()).toBe("30000");
    expect(payment.suspectedDuplicate).toBe(false);
  });

  it("un cobro de MP con un manual reciente y el período vigente queda como posible cobro doble", async () => {
    const id = await makeShop(planExpiresAtFromDate("2027-03-15", TZ));
    const manualAt = new Date("2027-03-14T15:00:00Z");
    await recordPayment({ barbershopId: id, source: "MANUAL", amount: "15000", paidAt: manualAt, months: 1 });
    // El manual dejó "pagado hasta" en 2027-04-15; MP cobra 3 días después.
    const mp = await recordPayment({
      barbershopId: id,
      source: "MERCADOPAGO",
      amount: "15000",
      paidAt: new Date(manualAt.getTime() + 3 * DAY_MS),
      months: 1,
      mpPaymentId: `test-${randomUUID()}`,
    });
    expect(mp).toEqual({ created: true, paidUntil: planExpiresAtFromDate("2027-05-15", TZ) });

    const payments = await db.subscriptionPayment.findMany({
      where: { barbershopId: id },
      orderBy: { paidAt: "asc" },
      select: { source: true, suspectedDuplicate: true },
    });
    expect(payments).toEqual([
      { source: "MANUAL", suspectedDuplicate: false },
      { source: "MERCADOPAGO", suspectedDuplicate: true },
    ]);
  });

  it("rechaza montos inválidos sin tocar la DB", async () => {
    const id = await makeShop(null);
    for (const amount of ["0", "-1", "12.345", "abc", "1e3"]) {
      await expect(
        recordPayment({ barbershopId: id, source: "MANUAL", amount, paidAt: new Date(), months: 1 }),
      ).rejects.toThrow();
    }
    expect(await db.subscriptionPayment.count({ where: { barbershopId: id } })).toBe(0);
    expect(await paidUntilOf(id)).toBeNull();
  });
});
