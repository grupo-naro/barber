"use client";

import { useActionState } from "react";
import { setBillingEnabled } from "@/server/actions/admin-billing";
import type { ActionResult } from "@/lib/barbershop-settings";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/app/(dashboard)/dashboard/settings/form-ui";

const ENABLE_NEVER_PAID_CONFIRM =
  "Esta barbería nunca pagó. Al activar el cobro, su página pública se despublica y el panel queda en la pantalla de pago hasta el primer pago. ¿Activar el cobro?";
const DISABLE_CONFIRM_MP =
  "¿Desactivar el cobro? Cancelamos la suscripción en Mercado Pago (no se puede deshacer: después hay que generar un link nuevo).";
const DISABLE_CONFIRM = "¿Desactivar el cobro? La barbería queda sin cobro (exenta).";

/** Toggle "cobro activado". Pide confirmación al activar sin "pagado hasta" y al desactivar. */
export function BillingToggleForm({
  id,
  billingEnabled,
  neverPaid,
  hasLivePreapproval,
}: {
  id: string;
  billingEnabled: boolean;
  neverPaid: boolean;
  hasLivePreapproval: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(setBillingEnabled, undefined);
  const enabling = !billingEnabled;
  const needsConfirm = enabling ? neverPaid : true;
  const message = enabling ? ENABLE_NEVER_PAID_CONFIRM : hasLivePreapproval ? DISABLE_CONFIRM_MP : DISABLE_CONFIRM;

  return (
    <form
      action={action}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        if (needsConfirm && !window.confirm(message)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="enabled" value={enabling ? "1" : "0"} />
      {enabling && neverPaid ? <input type="hidden" name="confirm" value="1" /> : null}
      <Button type="submit" variant={enabling ? "default" : "destructive"} className="w-fit" disabled={pending}>
        {pending ? "Guardando…" : enabling ? "Activar cobro" : "Desactivar cobro"}
      </Button>
      <FormStatus state={state} pending={pending} />
    </form>
  );
}
