"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getAdminSession } from "@/lib/admin-auth";
import {
  changeAmountSchema,
  generateLinkSchema,
  hasLivePreapproval,
  isFutureBusinessDate,
  manualPaidAtInstant,
  manualPaymentSchema,
  markDuplicateReviewedSchema,
  platformSettingsSchema,
  setBillingEnabledSchema,
} from "@/lib/admin-billing";
import { firstFieldErrors, type ActionResult } from "@/lib/barbershop-settings";
import { db } from "@/lib/db";
import { cancelPreapproval, createPreapproval, updatePreapprovalAmount } from "@/lib/mercadopago";
import { formatDateAR } from "@/lib/platform-admin";
import { recordPayment } from "@/server/billing";
import { barbershopBrandingTag } from "@/app/[slug]/data";

// Server Actions del cobro de la suscripción, desde el panel de la PLATAFORMA. Son endpoints públicos: en cada
// una, Zod `safeParse` → `getAdminSession()` (sin sesión de admin no se lee la DB ni se llama a MP) → query.
// Foco n.º 5: si MP falla al cancelar, no se aplica ningún cambio local; al regenerar nunca quedan dos
// preapprovals activos. Los errores de MP / billing se loguean y a la UI llegan solo mensajes genéricos.
// `recordPayment` se importa (no se re-exporta) y solo se llama desde `registerManualPayment`.
// Carreras (doble click, dos pestañas, regenerar mientras se desactiva): las escrituras posteriores a una llamada
// a MP son `updateMany` condicionados al `mpPreapprovalId` leído; si no actualizan nada, alguien cambió la fila
// en el medio y no se pisa (al regenerar, además, se cancela en MP el preapproval recién creado).
// Los formularios con campos de texto reciben en cada error `values` con lo enviado, para no perder lo tipeado.

const UNAUTHORIZED = "Tu sesión de administrador venció. Volvé a ingresar.";
const INVALID = "Revisá los campos marcados.";
const NOT_FOUND = "No encontramos esa barbería.";
const MP_NOTHING_CHANGED = "No pudimos hablar con Mercado Pago. No se cambió nada, probá de nuevo.";
const MP_CREATE_FAILED =
  "Cancelamos la suscripción anterior, pero Mercado Pago no pudo crear la nueva. Probá generar el link de nuevo.";
const BILLING_DISABLED = "Primero activá el cobro de esta barbería.";
const PAYMENT_FAILED = "No pudimos registrar el pago. No se cambió nada, probá de nuevo.";
const CHANGED_MEANWHILE = "La suscripción cambió mientras guardábamos. Recargá la página y probá de nuevo.";

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function logError(action: string, barbershopId: string, error: unknown) {
  console.error(`[admin-billing] ${action} falló (barbería ${barbershopId})`, error);
}

/** Lo que envió el form, como string (ausente → ""), para devolverlo en los errores. */
function submitted(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, text(formData, key) ?? ""]));
}

function revalidateAdmin(id: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/barbershops/${id}`);
}

const billingSelect = {
  id: true,
  slug: true,
  name: true,
  timezone: true,
  billingEnabled: true,
  planExpiresAt: true,
  mpPreapprovalId: true,
  mpStatus: true,
} as const;

// ---------------------------------------------------------------------------------------------------------------
// Link de suscripción (Generar / Regenerar)

export async function generateSubscriptionLink(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const values = submitted(formData, ["amount", "payerEmail"]);
  const parsed = generateLinkSchema.safeParse({
    id: text(formData, "id") ?? "",
    amount: values.amount,
    payerEmail: values.payerEmail,
  });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error), values };

  if (!(await getAdminSession())) return { ok: false, error: UNAUTHORIZED, values };
  const { id, amount, payerEmail } = parsed.data;

  const shop = await db.barbershop.findUnique({ where: { id }, select: billingSelect });
  if (!shop) return { ok: false, error: NOT_FOUND, values };
  if (!shop.billingEnabled) return { ok: false, error: BILLING_DISABLED, values };

  // Nunca dos preapprovals activos: primero se cancela el anterior. Si MP falla, no se crea nada.
  const cancelledOld = hasLivePreapproval(shop);
  if (cancelledOld) {
    try {
      await cancelPreapproval(shop.mpPreapprovalId);
    } catch (error) {
      logError("cancelPreapproval (regenerar)", shop.id, error);
      return { ok: false, error: MP_NOTHING_CHANGED, values };
    }
  }

  let created;
  try {
    created = await createPreapproval({
      barbershopId: shop.id,
      reason: `Suscripción mensual Barber · ${shop.name}`,
      payerEmail,
      amount,
    });
  } catch (error) {
    logError("createPreapproval", shop.id, error);
    if (cancelledOld) {
      // El anterior ya está cancelado en MP: se refleja localmente, solo si nadie cambió la fila en el medio.
      try {
        await db.barbershop.updateMany({
          where: { id: shop.id, mpPreapprovalId: shop.mpPreapprovalId },
          data: { mpStatus: "cancelled" },
        });
      } catch (dbError) {
        logError(`marcar cancelado el preapproval ${shop.mpPreapprovalId}`, shop.id, dbError);
      }
      revalidateAdmin(shop.id);
      return { ok: false, error: MP_CREATE_FAILED, values };
    }
    return { ok: false, error: MP_NOTHING_CHANGED, values };
  }

  let saved: number;
  try {
    // Condicionado a lo leído: si otra pestaña guardó otro preapproval o se desactivó el cobro, no se pisa.
    ({ count: saved } = await db.barbershop.updateMany({
      where: { id: shop.id, mpPreapprovalId: shop.mpPreapprovalId, billingEnabled: true },
      data: {
        mpPreapprovalId: created.id,
        mpInitPoint: created.init_point || null,
        mpStatus: created.status,
        monthlyAmount: amount,
        payerEmail,
      },
    }));
  } catch (error) {
    // El preapproval nuevo existe en MP pero no quedó guardado: se loguea su id para resolverlo a mano.
    logError(`guardar preapproval ${created.id}`, shop.id, error);
    return {
      ok: false,
      error: "Mercado Pago creó el link pero no pudimos guardarlo. Avisá al equipo técnico.",
      values,
    };
  }

  if (saved === 0) {
    // Carrera: la fila cambió mientras hablábamos con MP. El preapproval recién creado no tiene referencia
    // local, así que se cancela en MP para que no quede uno vivo sin dueño.
    logError(`guardar preapproval ${created.id} (la fila cambió en el medio)`, shop.id, "carrera");
    try {
      await cancelPreapproval(created.id);
    } catch (error) {
      logError(`cancelPreapproval ${created.id} (compensación; cancelarlo a mano en MP)`, shop.id, error);
    }
    revalidateAdmin(shop.id);
    return { ok: false, error: CHANGED_MEANWHILE, values };
  }

  revalidateAdmin(shop.id);
  return {
    ok: true,
    message: cancelledOld
      ? "Generamos un link nuevo y cancelamos el anterior en Mercado Pago."
      : "Link generado. Compartilo con el dueño.",
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Cambiar monto

export async function changeSubscriptionAmount(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const values = submitted(formData, ["amount"]);
  const parsed = changeAmountSchema.safeParse({
    id: text(formData, "id") ?? "",
    amount: values.amount,
  });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error), values };

  if (!(await getAdminSession())) return { ok: false, error: UNAUTHORIZED, values };
  const { id, amount } = parsed.data;

  const shop = await db.barbershop.findUnique({ where: { id }, select: billingSelect });
  if (!shop) return { ok: false, error: NOT_FOUND, values };

  let mpStatus: string | undefined;
  if (hasLivePreapproval(shop)) {
    try {
      mpStatus = (await updatePreapprovalAmount(shop.mpPreapprovalId, amount)).status;
    } catch (error) {
      logError("updatePreapprovalAmount", shop.id, error);
      return { ok: false, error: MP_NOTHING_CHANGED, values };
    }
  }

  try {
    await db.barbershop.update({ where: { id: shop.id }, data: { monthlyAmount: amount, ...(mpStatus ? { mpStatus } : {}) } });
  } catch (error) {
    logError("guardar monthlyAmount", shop.id, error);
    return {
      ok: false,
      error: mpStatus
        ? "Actualizamos el monto en Mercado Pago, pero no pudimos guardarlo acá. Probá de nuevo."
        : "No pudimos guardar el monto. Probá de nuevo.",
      values,
    };
  }

  revalidateAdmin(shop.id);
  return {
    ok: true,
    message: mpStatus ? "Monto actualizado, también en Mercado Pago." : "Monto guardado. Se usa al generar el link.",
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Activar / desactivar el cobro

export async function setBillingEnabled(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = setBillingEnabledSchema.safeParse({
    id: text(formData, "id") ?? "",
    enabled: text(formData, "enabled"),
    confirm: text(formData, "confirm"),
  });
  if (!parsed.success) return { ok: false, error: INVALID };

  if (!(await getAdminSession())) return { ok: false, error: UNAUTHORIZED };
  const { id, enabled, confirm } = parsed.data;

  const shop = await db.barbershop.findUnique({ where: { id }, select: billingSelect });
  if (!shop) return { ok: false, error: NOT_FOUND };

  if (enabled) {
    if (shop.billingEnabled) return { ok: true, message: "El cobro ya estaba activado." };
    // "Nunca pagó": queda AWAITING_FIRST_PAYMENT y la landing se despublica. Exige confirmación explícita.
    if (shop.planExpiresAt === null && !confirm) {
      return {
        ok: false,
        error: "Esta barbería nunca pagó: al activar el cobro, su página se despublica hasta el primer pago. Confirmalo.",
      };
    }
    await db.barbershop.update({ where: { id: shop.id }, data: { billingEnabled: true } });
  } else {
    if (!shop.billingEnabled) return { ok: true, message: "El cobro ya estaba desactivado." };
    // Foco n.º 5: si MP no confirma la cancelación, no se toca nada local.
    if (hasLivePreapproval(shop)) {
      try {
        await cancelPreapproval(shop.mpPreapprovalId);
      } catch (error) {
        logError("cancelPreapproval (desactivar)", shop.id, error);
        return { ok: false, error: MP_NOTHING_CHANGED };
      }
    }
    // Condicionado a lo leído: si otra pestaña generó un link nuevo en el medio, no se pisa su preapproval.
    const { count } = await db.barbershop.updateMany({
      where: { id: shop.id, mpPreapprovalId: shop.mpPreapprovalId, billingEnabled: true },
      data: { billingEnabled: false, ...(shop.mpPreapprovalId ? { mpStatus: "cancelled" } : {}) },
    });
    if (count === 0) {
      logError(
        `desactivar (la fila cambió en el medio; preapproval leído ${shop.mpPreapprovalId ?? "ninguno"})`,
        shop.id,
        "carrera",
      );
      revalidateAdmin(shop.id);
      return { ok: false, error: CHANGED_MEANWHILE };
    }
  }

  updateTag(barbershopBrandingTag(shop.slug));
  revalidateAdmin(shop.id);
  return {
    ok: true,
    message: enabled
      ? "Cobro activado."
      : shop.mpPreapprovalId
        ? "Cobro desactivado. Cancelamos la suscripción en Mercado Pago."
        : "Cobro desactivado.",
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Pago manual (transferencia)

export async function registerManualPayment(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const values = submitted(formData, ["amount", "paidAt", "months", "note"]);
  const parsed = manualPaymentSchema.safeParse({
    id: text(formData, "id") ?? "",
    amount: values.amount,
    paidAt: values.paidAt,
    months: text(formData, "months"),
    note: text(formData, "note"),
  });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error), values };

  const session = await getAdminSession();
  if (!session) return { ok: false, error: UNAUTHORIZED, values };
  const input = parsed.data;

  const shop = await db.barbershop.findUnique({ where: { id: input.id }, select: billingSelect });
  if (!shop) return { ok: false, error: NOT_FOUND, values };
  if (!shop.billingEnabled) return { ok: false, error: BILLING_DISABLED, values };
  if (isFutureBusinessDate(input.paidAt, new Date(), shop.timezone)) {
    return { ok: false, error: INVALID, fieldErrors: { paidAt: "La fecha de pago no puede ser futura." }, values };
  }

  let paidUntil: Date;
  try {
    ({ paidUntil } = await recordPayment({
      barbershopId: shop.id,
      source: "MANUAL",
      amount: input.amount,
      paidAt: manualPaidAtInstant(input.paidAt, shop.timezone),
      months: input.months,
      note: input.note ?? undefined,
      createdByAdminId: session.adminId,
    }));
  } catch (error) {
    logError("recordPayment (manual)", shop.id, error);
    return { ok: false, error: PAYMENT_FAILED, values };
  }

  // AWAITING_FIRST_PAYMENT → PAID: la landing vuelve a publicarse.
  updateTag(barbershopBrandingTag(shop.slug));
  revalidateAdmin(shop.id);
  return { ok: true, message: `Pago registrado. Pagado hasta el ${formatDateAR(paidUntil, shop.timezone)}.` };
}

// ---------------------------------------------------------------------------------------------------------------
// Alerta de posible cobro doble

export async function markDuplicateReviewed(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = markDuplicateReviewedSchema.safeParse({
    id: text(formData, "id") ?? "",
    paymentId: text(formData, "paymentId") ?? "",
  });
  if (!parsed.success) return { ok: false, error: INVALID };

  if (!(await getAdminSession())) return { ok: false, error: UNAUTHORIZED };
  const { id, paymentId } = parsed.data;

  // Filtra por barbería y por pago: un `paymentId` de otra barbería no se toca.
  const { count } = await db.subscriptionPayment.updateMany({
    where: { id: paymentId, barbershopId: id, suspectedDuplicate: true, duplicateReviewedAt: null },
    data: { duplicateReviewedAt: new Date() },
  });
  if (count === 0) return { ok: false, error: "No encontramos ese pago pendiente de revisión." };

  revalidateAdmin(id);
  return { ok: true, message: "Marcado como revisado." };
}

// ---------------------------------------------------------------------------------------------------------------
// Ajustes de la plataforma

export async function updatePlatformSettings(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = platformSettingsSchema.safeParse({
    transferAlias: text(formData, "transferAlias"),
    transferCbu: text(formData, "transferCbu"),
    transferHolder: text(formData, "transferHolder"),
    contactWhatsapp: text(formData, "contactWhatsapp"),
  });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error) };

  if (!(await getAdminSession())) return { ok: false, error: UNAUTHORIZED };

  await db.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...parsed.data },
    update: parsed.data,
  });

  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: "Ajustes guardados.",
    values: Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, value ?? ""])),
  };
}
