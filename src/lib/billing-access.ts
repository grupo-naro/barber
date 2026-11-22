// Acceso al panel según el estado de cobro, y textos derivados (banner de GRACE, link de WhatsApp).
// Sin `server-only`: solo `import type` de la sesión, para poder testearlo mockeando `next/navigation`.
import { redirect } from "next/navigation";
import type { Session } from "@/lib/auth";
import { BILLING_GRACE_DAYS, canUsePanel } from "@/lib/billing";
import { formatDateAR } from "@/lib/platform-admin";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Guard de las server actions del panel: con el panel bloqueado por cobro (`AWAITING_FIRST_PAYMENT` o
 * `BLOCKED`) redirige a `/dashboard`, que muestra la pantalla de pago. No usarlo en páginas ni layouts
 * (`/dashboard` no lo llama: no hay loop). Las actions de cuenta y logout no lo llaman.
 */
export function requirePanelAccess(session: Session): void {
  if (!canUsePanel(session.barbershop.billingState)) redirect("/dashboard");
}

/** Último instante del margen: `paidUntil + BILLING_GRACE_DAYS`. */
export function graceDeadline(paidUntil: Date): Date {
  return new Date(paidUntil.getTime() + BILLING_GRACE_DAYS * DAY_MS);
}

/** Banner del dueño en `GRACE`, con la fecha límite en la timezone de la barbería. */
export function graceBannerMessage(paidUntil: Date, timeZone: string): string {
  return `No pudimos cobrar tu suscripción. Tenés hasta el ${formatDateAR(graceDeadline(paidUntil), timeZone)} para regularizarla.`;
}

/** Link de WhatsApp a la plataforma avisando la transferencia, o `null` si `contactWhatsapp` no tiene dígitos. */
export function transferWhatsappUrl(contactWhatsapp: string | null | undefined, barbershopName: string): string | null {
  const digits = (contactWhatsapp ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const text = `Hola, ya transferí la suscripción de ${barbershopName}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
