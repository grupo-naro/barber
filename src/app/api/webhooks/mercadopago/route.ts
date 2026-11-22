import { verifyMpSignature } from "@/lib/mercadopago-signature";
import { handleMpNotification } from "@/server/mercadopago-webhook";

// Webhook de Mercado Pago (suscripciones). Ruta pública sin sesión: la única defensa es `x-signature`.
// Sin secreto configurado o con firma inválida no se toca la DB ni la API de MP.
// - Firma válida → 200, también si la notificación se ignora (para que MP no reintente).
// - Error inesperado → 500 con texto genérico (MP reintenta); el detalle solo va a los logs.
// El `data.id` que se procesa es el del query param, que es el que cubre la firma (el body no está firmado).

function text(status: number, body: string) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function idString(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[mp-webhook] MP_WEBHOOK_SECRET no está configurado: se rechaza la notificación");
    return text(503, "Service unavailable");
  }

  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id") || null;
  const valid = verifyMpSignature({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
    secret,
  });
  if (!valid) return text(401, "Unauthorized");

  // El body se lee una sola vez.
  let body: Record<string, unknown> | null;
  try {
    body = asObject(JSON.parse(await request.text()));
  } catch {
    body = null;
  }
  if (!body) return text(400, "Bad request");

  const bodyDataId = idString(asObject(body.data)?.id);
  if (!dataId || (bodyDataId !== null && bodyDataId.toLowerCase() !== dataId.toLowerCase())) {
    return text(400, "Bad request");
  }
  const type = idString(body.type) ?? url.searchParams.get("type");
  if (!type) return text(400, "Bad request");

  try {
    await handleMpNotification({ type, dataId });
  } catch (error) {
    console.error("[mp-webhook] error procesando la notificación", { type, dataId }, error);
    return text(500, "Internal error");
  }
  return text(200, "OK");
}
