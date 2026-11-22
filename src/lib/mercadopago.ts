// Cliente REST mínimo de Mercado Pago (suscripciones sin plan y pagos), con `fetch` y sin SDK.
// El token (`MP_ACCESS_TOKEN`) y la URL de la app (`APP_BASE_URL`) se leen al llamar, no al importar:
// el build no necesita esas variables. Los errores (`MpError`) nunca incluyen el token.
import "server-only";

const MP_API = "https://api.mercadopago.com";
/** Corte por request: el webhook tiene que responder en menos de 22 s. */
const TIMEOUT_MS = 10_000;

export type MpPreapproval = {
  id: string;
  status: string;
  init_point: string;
  payer_email: string;
  external_reference: string | null;
  auto_recurring: { transaction_amount: number; currency_id: string };
};

export type MpPayment = {
  id: string;
  status: string;
  transaction_amount: number;
  date_approved: string | null;
  /** Id del preapproval al que pertenece el pago, si MP lo informa (ver supuestos en `getPayment`). */
  preapprovalId: string | null;
  externalReference: string | null;
};

export type MpAuthorizedPayment = {
  id: string;
  preapproval_id: string;
  /** Id del **pago** asociado a la cuota; `null` si todavía no se cobró. */
  paymentId: string | null;
  paymentStatus: string | null;
};

export class MpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "MpError";
    this.status = status;
  }
}

function accessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new MpError(0, "Falta configurar MP_ACCESS_TOKEN");
  return token;
}

function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) throw new MpError(0, "Falta configurar APP_BASE_URL");
  return url.replace(/\/+$/, "");
}

async function mpFetch(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<unknown> {
  const token = accessToken();
  let res: Response;
  try {
    res = await fetch(`${MP_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // El error de red puede traer la request; no lo propagamos para no arrastrar headers.
    throw new MpError(0, `Mercado Pago no respondió (${method} ${path})`);
  }
  if (!res.ok) throw new MpError(res.status, `Mercado Pago respondió ${res.status} (${method} ${path})`);
  try {
    return await res.json();
  } catch {
    throw new MpError(res.status, `Respuesta inválida de Mercado Pago (${method} ${path})`);
  }
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function optString(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function reqString(value: unknown, field: string): string {
  const s = optString(value);
  if (s === null) throw new MpError(0, `Respuesta de Mercado Pago sin ${field}`);
  return s;
}

function idSegment(id: string): string {
  return encodeURIComponent(id);
}

function toAmount(amount: string): number {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    throw new MpError(0, "Monto inválido para Mercado Pago");
  }
  return Number(amount);
}

function toPreapproval(raw: unknown): MpPreapproval {
  const json = asObject(raw);
  const recurring = asObject(json.auto_recurring);
  return {
    id: reqString(json.id, "id"),
    status: reqString(json.status, "status"),
    init_point: optString(json.init_point) ?? "",
    payer_email: optString(json.payer_email) ?? "",
    external_reference: optString(json.external_reference),
    auto_recurring: {
      transaction_amount: typeof recurring.transaction_amount === "number" ? recurring.transaction_amount : 0,
      currency_id: optString(recurring.currency_id) ?? "",
    },
  };
}

/** Crea una suscripción sin plan en estado `pending`; el pagador la autoriza desde `init_point`. */
export async function createPreapproval(input: {
  barbershopId: string;
  reason: string;
  payerEmail: string;
  amount: string;
}): Promise<MpPreapproval> {
  const body = {
    status: "pending",
    payer_email: input.payerEmail,
    external_reference: input.barbershopId,
    reason: input.reason,
    back_url: `${appBaseUrl()}/dashboard`,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: toAmount(input.amount),
      currency_id: "ARS",
    },
  };
  return toPreapproval(await mpFetch("POST", "/preapproval", body));
}

export async function getPreapproval(id: string): Promise<MpPreapproval> {
  return toPreapproval(await mpFetch("GET", `/preapproval/${idSegment(id)}`));
}

export async function updatePreapprovalAmount(id: string, amount: string): Promise<MpPreapproval> {
  const body = { auto_recurring: { transaction_amount: toAmount(amount), currency_id: "ARS" } };
  return toPreapproval(await mpFetch("PUT", `/preapproval/${idSegment(id)}`, body));
}

export async function cancelPreapproval(id: string): Promise<MpPreapproval> {
  return toPreapproval(await mpFetch("PUT", `/preapproval/${idSegment(id)}`, { status: "cancelled" }));
}

/**
 * `GET /v1/payments/{id}`. La doc de MP no documenta un campo con el id del preapproval: se toma de
 * `metadata.preapproval_id` o `point_of_interaction.transaction_data.subscription_id` si vienen (supuesto a
 * validar en sandbox). Si no, `preapprovalId` queda `null`.
 */
export async function getPayment(id: string): Promise<MpPayment> {
  const json = asObject(await mpFetch("GET", `/v1/payments/${idSegment(id)}`));
  const metadata = asObject(json.metadata);
  const txData = asObject(asObject(json.point_of_interaction).transaction_data);
  const amount = json.transaction_amount;
  return {
    id: reqString(json.id, "id"),
    status: reqString(json.status, "status"),
    transaction_amount: typeof amount === "number" && Number.isFinite(amount) ? amount : Number.NaN,
    date_approved: optString(json.date_approved),
    preapprovalId: optString(metadata.preapproval_id) ?? optString(txData.subscription_id),
    externalReference: optString(json.external_reference),
  };
}

/**
 * `GET /authorized_payments/{id}` (cuota de una suscripción). La doc no detalla el body: se lee de forma
 * defensiva `preapproval_id` y el pago asociado desde `payment.id` / `payment.status` (puede faltar si la cuota
 * todavía no se cobró). Supuesto a validar en sandbox.
 */
export async function getAuthorizedPayment(id: string): Promise<MpAuthorizedPayment> {
  const json = asObject(await mpFetch("GET", `/authorized_payments/${idSegment(id)}`));
  const payment = asObject(json.payment);
  return {
    id: reqString(json.id, "id"),
    preapproval_id: reqString(json.preapproval_id, "preapproval_id"),
    paymentId: optString(payment.id),
    paymentStatus: optString(payment.status),
  };
}
