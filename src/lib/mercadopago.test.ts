import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const TOKEN = "TEST-1234567890-secret-token";
const preapprovalJson = {
  id: "2c938084726fca480172750000000000",
  status: "pending",
  init_point: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=2c93",
  payer_email: "duenio@example.com",
  external_reference: "shop_1",
  auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 15000.5, currency_id: "ARS" },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("MP_ACCESS_TOKEN", TOKEN);
  vi.stubEnv("APP_BASE_URL", "https://app.example.com/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  const headers = new Headers(init?.headers);
  return {
    url: String(url),
    method: init?.method,
    auth: headers.get("Authorization"),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
}

describe("cliente de Mercado Pago", () => {
  it("se importa sin variables de entorno (se leen al llamar)", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("MP_ACCESS_TOKEN", "");
    vi.resetModules();
    const mp = await import("@/lib/mercadopago");
    expect(typeof mp.createPreapproval).toBe("function");
    await expect(mp.getPreapproval("x")).rejects.toBeInstanceOf(mp.MpError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("createPreapproval hace POST /preapproval con Bearer y el body esperado", async () => {
    const { createPreapproval } = await import("@/lib/mercadopago");
    fetchMock.mockResolvedValueOnce(jsonResponse(preapprovalJson, 201));
    const result = await createPreapproval({
      barbershopId: "shop_1",
      reason: "Suscripción Barbería Test",
      payerEmail: "duenio@example.com",
      amount: "15000.50",
    });
    const call = lastCall();
    expect(call.url).toBe("https://api.mercadopago.com/preapproval");
    expect(call.method).toBe("POST");
    expect(call.auth).toBe(`Bearer ${TOKEN}`);
    expect(call.body).toEqual({
      status: "pending",
      payer_email: "duenio@example.com",
      external_reference: "shop_1",
      reason: "Suscripción Barbería Test",
      back_url: "https://app.example.com/dashboard",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 15000.5, currency_id: "ARS" },
    });
    expect(result.id).toBe(preapprovalJson.id);
    expect(result.init_point).toBe(preapprovalJson.init_point);
    expect(result.auto_recurring).toEqual({ transaction_amount: 15000.5, currency_id: "ARS" });
  });

  it("updatePreapprovalAmount y cancelPreapproval usan PUT /preapproval/{id}", async () => {
    const { updatePreapprovalAmount, cancelPreapproval } = await import("@/lib/mercadopago");
    fetchMock.mockResolvedValueOnce(jsonResponse(preapprovalJson));
    await updatePreapprovalAmount("pre_1", "20000");
    let call = lastCall();
    expect(call.url).toBe("https://api.mercadopago.com/preapproval/pre_1");
    expect(call.method).toBe("PUT");
    expect(call.auth).toBe(`Bearer ${TOKEN}`);
    expect(call.body).toEqual({ auto_recurring: { transaction_amount: 20000, currency_id: "ARS" } });

    fetchMock.mockResolvedValueOnce(jsonResponse({ ...preapprovalJson, status: "cancelled" }));
    const cancelled = await cancelPreapproval("pre_1");
    call = lastCall();
    expect(call.url).toBe("https://api.mercadopago.com/preapproval/pre_1");
    expect(call.method).toBe("PUT");
    expect(call.body).toEqual({ status: "cancelled" });
    expect(cancelled.status).toBe("cancelled");
  });

  it("fuera de 2xx lanza MpError con status y sin el token en el message", async () => {
    const { getPreapproval, MpError } = await import("@/lib/mercadopago");
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: `invalid token ${TOKEN}` }, 401));
    const error = await getPreapproval("pre_1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MpError);
    expect((error as InstanceType<typeof MpError>).status).toBe(401);
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it("un error de red también es MpError sin el token", async () => {
    const { getPayment, MpError } = await import("@/lib/mercadopago");
    fetchMock.mockRejectedValueOnce(new Error(`boom Bearer ${TOKEN}`));
    const error = await getPayment("1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MpError);
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it("getPayment normaliza el pago y toma el preapproval de metadata o point_of_interaction", async () => {
    const { getPayment } = await import("@/lib/mercadopago");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 987654321,
        status: "approved",
        status_detail: "accredited",
        transaction_amount: 15000,
        date_approved: "2027-03-14T12:00:00.000-03:00",
        operation_type: "recurring_payment",
        metadata: { preapproval_id: "pre_1" },
        external_reference: "shop_1",
      }),
    );
    expect(await getPayment("987654321")).toEqual({
      id: "987654321",
      status: "approved",
      transaction_amount: 15000,
      date_approved: "2027-03-14T12:00:00.000-03:00",
      preapprovalId: "pre_1",
      externalReference: "shop_1",
    });
    expect(lastCall().url).toBe("https://api.mercadopago.com/v1/payments/987654321");
    expect(lastCall().method).toBe("GET");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 1,
        status: "approved",
        transaction_amount: 10,
        date_approved: null,
        point_of_interaction: { transaction_data: { subscription_id: "pre_2" } },
      }),
    );
    expect((await getPayment("1")).preapprovalId).toBe("pre_2");

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 2, status: "rejected", transaction_amount: 10 }));
    const bare = await getPayment("2");
    expect(bare.preapprovalId).toBeNull();
    expect(bare.date_approved).toBeNull();
  });

  it("getAuthorizedPayment lee preapproval_id y el pago asociado, tolerando que falte", async () => {
    const { getAuthorizedPayment } = await import("@/lib/mercadopago");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 6114264375, preapproval_id: "pre_1", payment: { id: 987654321, status: "approved" } }),
    );
    expect(await getAuthorizedPayment("6114264375")).toEqual({
      id: "6114264375",
      preapproval_id: "pre_1",
      paymentId: "987654321",
      paymentStatus: "approved",
    });
    expect(lastCall().url).toBe("https://api.mercadopago.com/authorized_payments/6114264375");

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, preapproval_id: "pre_1", status: "scheduled" }));
    expect(await getAuthorizedPayment("1")).toMatchObject({ paymentId: null, paymentStatus: null });
  });
});
