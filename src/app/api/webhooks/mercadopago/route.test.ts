import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleMpNotification } from "@/server/mercadopago-webhook";
import { POST } from "./route";

vi.mock("@/server/mercadopago-webhook", () => ({ handleMpNotification: vi.fn() }));

const mockedHandle = vi.mocked(handleMpNotification);
const SECRET = "test-webhook-secret";
const TS = "1742505638683";
const REQUEST_ID = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";

function signature(dataId: string | null, secret = SECRET) {
  const manifest = `${dataId ? `id:${dataId};` : ""}request-id:${REQUEST_ID};ts:${TS};`;
  return `ts=${TS},v1=${createHmac("sha256", secret).update(manifest).digest("hex")}`;
}

function notification(opts: {
  dataId?: string | null;
  body?: string;
  xSignature?: string | null;
} = {}) {
  const dataId = opts.dataId === undefined ? "123456" : opts.dataId;
  const url = new URL("https://app.example.com/api/webhooks/mercadopago");
  if (dataId) {
    url.searchParams.set("data.id", dataId);
    url.searchParams.set("type", "payment");
  }
  const headers = new Headers({ "Content-Type": "application/json", "x-request-id": REQUEST_ID });
  const xSignature = opts.xSignature === undefined ? signature(dataId) : opts.xSignature;
  if (xSignature !== null) headers.set("x-signature", xSignature);
  const body =
    opts.body ??
    JSON.stringify({
      id: 12345,
      live_mode: false,
      type: "payment",
      date_created: "2027-03-14T12:00:00Z",
      user_id: 44444,
      api_version: "v1",
      action: "payment.created",
      data: { id: dataId ?? undefined },
    });
  return new Request(url, { method: "POST", headers, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedHandle.mockResolvedValue("processed");
  vi.stubEnv("MP_WEBHOOK_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/mercadopago", () => {
  it("firma inválida o sin x-signature: 401 sin llamar al handler", async () => {
    for (const xSignature of [null, signature("123456", "otro-secreto"), "ts=1,v1=abcd", "basura"]) {
      const res = await POST(notification({ xSignature }));
      expect(res.status).toBe(401);
    }
    // Firma de otro data.id.
    expect((await POST(notification({ xSignature: signature("999") }))).status).toBe(401);
    expect(mockedHandle).not.toHaveBeenCalled();
  });

  it("sin MP_WEBHOOK_SECRET: no 2xx y no llama al handler", async () => {
    vi.stubEnv("MP_WEBHOOK_SECRET", "");
    const res = await POST(notification());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockedHandle).not.toHaveBeenCalled();
  });

  it("firma válida: 200 y llama al handler con type y el data.id firmado", async () => {
    const res = await POST(notification());
    expect(res.status).toBe(200);
    expect(mockedHandle).toHaveBeenCalledTimes(1);
    expect(mockedHandle).toHaveBeenCalledWith({ type: "payment", dataId: "123456" });
  });

  it("firma válida con resultado ignored: 200", async () => {
    mockedHandle.mockResolvedValueOnce("ignored");
    expect((await POST(notification())).status).toBe(200);
  });

  it("body que no es JSON, sin data.id o con un data.id distinto al firmado: 4xx sin llamar al handler", async () => {
    const cases = [
      notification({ body: "no es json" }),
      notification({ body: "[]" }),
      notification({ dataId: null }),
      notification({ body: JSON.stringify({ type: "payment", data: { id: "otro" } }) }),
    ];
    for (const req of cases) {
      const res = await POST(req);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    expect(mockedHandle).not.toHaveBeenCalled();
  });

  it("si el handler lanza: 500 con texto genérico, sin datos internos; el detalle va a console.error", async () => {
    mockedHandle.mockRejectedValueOnce(new Error("Monto inválido: 123 de shop_abc"));
    const res = await POST(notification({ dataId: "987" }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("shop_abc");
    expect(text).not.toContain("123");
    expect(console.error).toHaveBeenCalled();
  });
});
