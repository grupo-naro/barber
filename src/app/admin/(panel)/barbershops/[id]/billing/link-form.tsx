"use client";

import { useActionState } from "react";
import { generateSubscriptionLink } from "@/server/actions/admin-billing";
import type { ActionResult } from "@/lib/barbershop-settings";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/app/(dashboard)/dashboard/settings/form-ui";
import { AdminField } from "../../../field";

const REGENERATE_CONFIRM =
  "¿Generar un link nuevo? Cancelamos la suscripción actual en Mercado Pago y el link anterior deja de servir.";

/** Generar (o regenerar) el link de suscripción de MP con el monto y el mail del pagador. */
export function SubscriptionLinkForm({
  id,
  defaultAmount,
  defaultPayerEmail,
  hasLink,
  hasLivePreapproval,
}: {
  id: string;
  defaultAmount: string;
  defaultPayerEmail: string;
  hasLink: boolean;
  hasLivePreapproval: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(generateSubscriptionLink, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form
      action={action}
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        if (hasLivePreapproval && !window.confirm(REGENERATE_CONFIRM)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField
          id="link-amount"
          name="amount"
          label="Monto mensual (ARS)"
          inputMode="decimal"
          defaultValue={defaultAmount}
          placeholder="15000"
          required
          error={errors.amount}
          hint="Sin puntos de miles; hasta 2 decimales con punto."
        />
        <AdminField
          id="link-payer-email"
          name="payerEmail"
          label="Mail de la cuenta de MP del pagador"
          type="email"
          defaultValue={defaultPayerEmail}
          autoCapitalize="none"
          spellCheck={false}
          required
          error={errors.payerEmail}
          hint="Por defecto, el del dueño."
        />
      </div>
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Generando…" : hasLink ? "Regenerar link" : "Generar link"}
      </Button>
      <FormStatus state={state} pending={pending} />
    </form>
  );
}
