import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatARS, hasLivePreapproval, mpStatusLabel, PAYMENT_SOURCE_LABELS } from "@/lib/admin-billing";
import { billingState } from "@/lib/billing";
import { businessDate } from "@/lib/time";
import type { AdminBarbershopDetail, AdminSubscriptionPayment } from "@/server/queries/admin";
import { BillingBadge } from "../../../billing-badge";
import { formatDate } from "../../../format";
import { ChangeAmountForm } from "./amount-form";
import { BillingToggleForm } from "./billing-toggle-form";
import { CopySubscriptionLink } from "./copy-link";
import { SubscriptionLinkForm } from "./link-form";
import { ManualPaymentForm } from "./manual-payment-form";
import { MarkReviewedButton } from "./review-button";

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function Disclosure({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group rounded-xl border p-3" open={open}>
      <summary className="cursor-pointer text-sm font-semibold select-none">{title}</summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

/** Sección "Suscripción" de la ficha: estado de cobro, link de MP, formularios y el historial de pagos. */
export function SubscriptionSection({
  shop,
  payments,
  now,
}: {
  shop: AdminBarbershopDetail;
  payments: AdminSubscriptionPayment[];
  now: Date;
}) {
  const state = billingState({ billingEnabled: shop.billingEnabled, paidUntil: shop.planExpiresAt }, now);
  const live = hasLivePreapproval(shop);
  const amount = shop.monthlyAmount ?? "";
  const pendingReview = payments.filter((p) => p.suspectedDuplicate && !p.duplicateReviewedAt).length;

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle>
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            Suscripción
            <BillingBadge state={state} />
            {pendingReview > 0 ? (
              <Badge variant="destructive">
                <AlertTriangle aria-hidden />
                {pendingReview === 1 ? "1 posible cobro doble" : `${pendingReview} posibles cobros dobles`}
              </Badge>
            ) : null}
          </h2>
        </CardTitle>
        <CardDescription>
          {shop.billingEnabled
            ? "El cobro está activado: \"pagado hasta\" solo cambia con pagos de Mercado Pago o manuales."
            : "Cobro desactivado: la barbería está exenta y no se le pide pago."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary label="Estado en Mercado Pago">{mpStatusLabel(shop.mpStatus)}</Summary>
          <Summary label="Pagado hasta">{formatDate(shop.planExpiresAt, shop.timezone)}</Summary>
          <Summary label="Monto mensual">{formatARS(shop.monthlyAmount)}</Summary>
          <Summary label="Mail del pagador">{shop.payerEmail ?? "—"}</Summary>
        </dl>

        {shop.mpInitPoint && shop.mpStatus !== "cancelled" ? (
          <CopySubscriptionLink url={shop.mpInitPoint} payerEmail={shop.payerEmail} />
        ) : shop.mpStatus === "cancelled" ? (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">
            La suscripción de Mercado Pago está cancelada. Si querés volver a cobrarle por MP, generá un link nuevo.
          </p>
        ) : null}

        {shop.billingEnabled ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Disclosure title={shop.mpPreapprovalId ? "Regenerar link" : "Generar link"} open={!shop.mpPreapprovalId}>
              <SubscriptionLinkForm
                id={shop.id}
                defaultAmount={amount}
                defaultPayerEmail={shop.payerEmail ?? shop.owner?.email ?? ""}
                hasLink={shop.mpPreapprovalId !== null}
                hasLivePreapproval={live}
              />
            </Disclosure>
            <Disclosure title="Cambiar monto">
              <ChangeAmountForm id={shop.id} defaultAmount={amount} syncsWithMp={live} />
            </Disclosure>
            <Disclosure title="Registrar pago manual" open={state === "AWAITING_FIRST_PAYMENT" || state === "BLOCKED"}>
              <ManualPaymentForm id={shop.id} defaultAmount={amount} today={businessDate(now, shop.timezone)} />
            </Disclosure>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <h3 className="text-sm font-semibold">Cobro {shop.billingEnabled ? "activado" : "desactivado"}</h3>
          <p className="text-sm text-muted-foreground">
            {shop.billingEnabled
              ? live
                ? "Desactivarlo cancela la suscripción en Mercado Pago. Si MP no responde, no se cambia nada."
                : "Desactivarlo deja la barbería exenta de pago."
              : shop.planExpiresAt === null
                ? "Nunca pagó: al activarlo, su página se despublica hasta el primer pago."
                : `Al activarlo queda al día hasta el ${formatDate(shop.planExpiresAt, shop.timezone)} y después sigue el camino normal.`}
          </p>
          <BillingToggleForm
            id={shop.id}
            billingEnabled={shop.billingEnabled}
            neverPaid={shop.planExpiresAt === null}
            hasLivePreapproval={live}
          />
        </div>

        <section aria-labelledby="payments-title" className="flex flex-col gap-2">
          <h3 id="payments-title" className="text-sm font-semibold">
            Historial de pagos
          </h3>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay pagos registrados.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border">
              {payments.map((payment) => {
                const needsReview = payment.suspectedDuplicate && !payment.duplicateReviewedAt;
                return (
                  <li key={payment.id} className="flex flex-col gap-1.5 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium tabular-nums">{formatARS(payment.amount)}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{PAYMENT_SOURCE_LABELS[payment.source]}</Badge>
                        {needsReview ? (
                          <Badge variant="destructive">
                            <AlertTriangle aria-hidden />
                            Posible cobro doble
                          </Badge>
                        ) : payment.suspectedDuplicate ? (
                          <Badge variant="secondary">Cobro doble revisado</Badge>
                        ) : null}
                      </span>
                    </div>
                    <p className="text-muted-foreground tabular-nums">
                      Pagado el {formatDate(payment.paidAt, shop.timezone)} · cubre hasta el{" "}
                      {formatDate(payment.coversUntil, shop.timezone)}
                    </p>
                    {payment.note ? <p className="break-words">{payment.note}</p> : null}
                    {needsReview ? (
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-muted-foreground">
                          Entró un cobro de Mercado Pago con el período ya cubierto por un pago manual reciente. Devolvelo
                          desde MP o tomalo como el mes siguiente, y marcalo revisado.
                        </p>
                        <MarkReviewedButton id={shop.id} paymentId={payment.id} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
