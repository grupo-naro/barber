// Procesa una notificación de Mercado Pago **ya validada** (firma `x-signature` ok en la ruta).
// La notificación es solo una señal: se vuelve a consultar el recurso con nuestro token y la barbería se
// resuelve únicamente por el `id` del preapproval que devuelve MP (`Barbershop.mpPreapprovalId`), nunca por
// campos del body. Idempotente: `recordPayment` deduplica por el id del **pago** (nunca el de la cuota).
//
// Devuelve "ignored" para lo que no nos corresponde (tipos desconocidos, preapprovals ajenos, cuotas sin
// cobrar, anomalías cross-tenant) y deja que los errores inesperados suban (la ruta responde 500 y MP reintenta).
import { db } from "@/lib/db";
import { getAuthorizedPayment, getPayment, getPreapproval } from "@/lib/mercadopago";
import { MpPaymentConflictError, recordPayment } from "@/server/billing";

export type MpNotification = { type: string; dataId: string };
export type MpNotificationResult = "processed" | "ignored";

function log(message: string, detail: Record<string, unknown>) {
  console.warn(`[mp-webhook] ${message}`, detail);
}

async function shopByPreapproval(preapprovalId: string) {
  return db.barbershop.findUnique({ where: { mpPreapprovalId: preapprovalId }, select: { id: true } });
}

async function handlePreapproval(dataId: string): Promise<MpNotificationResult> {
  const preapproval = await getPreapproval(dataId);
  const shop = await shopByPreapproval(preapproval.id);
  if (!shop) {
    log("preapproval desconocido", { preapprovalId: preapproval.id, status: preapproval.status });
    return "ignored";
  }
  await db.barbershop.update({ where: { id: shop.id }, data: { mpStatus: preapproval.status } });
  return "processed";
}

/**
 * Registra el pago `paymentId` si está aprobado. `knownPreapprovalId` es el preapproval que informó MP en la
 * cuota (`/authorized_payments`), por si `/v1/payments` no lo trae.
 */
async function handlePayment(paymentId: string, knownPreapprovalId: string | null): Promise<MpNotificationResult> {
  const payment = await getPayment(paymentId);
  if (payment.preapprovalId && knownPreapprovalId && payment.preapprovalId !== knownPreapprovalId) {
    console.error("[mp-webhook] anomalía: el pago y la cuota informan preapprovals distintos", {
      paymentId: payment.id,
    });
    return "ignored";
  }
  const preapprovalId = payment.preapprovalId ?? knownPreapprovalId;
  if (!preapprovalId) {
    log("pago sin preapproval asociado", { paymentId: payment.id, status: payment.status });
    return "ignored";
  }
  const shop = await shopByPreapproval(preapprovalId);
  if (!shop) {
    log("pago de un preapproval desconocido", { paymentId: payment.id, preapprovalId });
    return "ignored";
  }
  if (payment.status !== "approved") return "processed";
  if (!payment.date_approved) {
    log("pago aprobado sin date_approved", { paymentId: payment.id });
    return "ignored";
  }

  try {
    await recordPayment({
      barbershopId: shop.id,
      source: "MERCADOPAGO",
      months: 1,
      mpPaymentId: payment.id,
      // Sin aritmética flotante: el valor recibido se formatea a 2 decimales y `recordPayment` lo valida.
      amount: payment.transaction_amount.toFixed(2),
      paidAt: new Date(payment.date_approved),
    });
  } catch (error) {
    if (error instanceof MpPaymentConflictError) {
      console.error("[mp-webhook] anomalía: pago de MP ya registrado en otra barbería", {
        paymentId: payment.id,
        preapprovalId,
      });
      return "ignored";
    }
    throw error;
  }
  return "processed";
}

export async function handleMpNotification(n: MpNotification): Promise<MpNotificationResult> {
  switch (n.type) {
    case "subscription_preapproval":
      return handlePreapproval(n.dataId);
    case "payment":
      return handlePayment(n.dataId, null);
    case "subscription_authorized_payment": {
      const cuota = await getAuthorizedPayment(n.dataId);
      if (!cuota.paymentId) {
        log("cuota sin pago asociado todavía", { authorizedPaymentId: cuota.id });
        return "ignored";
      }
      return handlePayment(cuota.paymentId, cuota.preapproval_id);
    }
    default:
      return "ignored";
  }
}
