// Validación del header `x-signature` de los webhooks de Mercado Pago. Sin dependencias de Next.
// Formato (doc de MP, "Webhooks" de suscripciones):
//   x-signature: ts=<timestamp>,v1=<hmac sha256 hex>
//   manifiesto:  id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// `data.id` sale del query param `data.id` de la URL de la notificación (en minúsculas si es alfanumérico).
// Si `data.id` o `x-request-id` no vienen, se quita su tramo del manifiesto. El HMAC usa la clave secreta
// del webhook (no el access token).
import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifyMpSignatureInput = {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
};

function parseSignatureHeader(header: string): { ts: string | null; v1: string | null } {
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "ts") ts = value;
    else if (key === "v1") v1 = value;
  }
  return { ts: ts || null, v1: v1 || null };
}

/** Manifiesto que firma MP. Exportado solo para documentar el formato; los tests lo arman a mano. */
export function mpSignatureManifest(input: { dataId: string | null; xRequestId: string | null; ts: string }) {
  let manifest = "";
  if (input.dataId) {
    const id = /^[a-z0-9]+$/i.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId;
    manifest += `id:${id};`;
  }
  if (input.xRequestId) manifest += `request-id:${input.xRequestId};`;
  return `${manifest}ts:${input.ts};`;
}

/** `true` solo si `v1` coincide con el HMAC-SHA256 del manifiesto. Nunca lanza. */
export function verifyMpSignature({ xSignature, xRequestId, dataId, secret }: VerifyMpSignatureInput): boolean {
  if (!xSignature || !secret) return false;
  const { ts, v1 } = parseSignatureHeader(xSignature);
  if (!ts || !v1 || !/^(?:[0-9a-f]{2})+$/i.test(v1)) return false;

  const expected = createHmac("sha256", secret).update(mpSignatureManifest({ dataId, xRequestId, ts })).digest();
  const provided = Buffer.from(v1, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
