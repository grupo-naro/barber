"use client";

import { useActionState } from "react";
import { registerManualPayment } from "@/server/actions/admin-billing";
import type { ActionResult } from "@/lib/barbershop-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus, nativeFieldClass } from "@/app/(dashboard)/dashboard/settings/form-ui";
import { AdminField } from "../../../field";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Registrar un pago por transferencia: extiende "pagado hasta". No toca la suscripción de MP. */
export function ManualPaymentForm({
  id,
  defaultAmount,
  today,
}: {
  id: string;
  defaultAmount: string;
  /** Día de negocio de hoy ("YYYY-MM-DD") en la timezone de la barbería: tope de la fecha. */
  today: string;
}) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(registerManualPayment, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminField
          id="manual-amount"
          name="amount"
          label="Monto (ARS)"
          inputMode="decimal"
          defaultValue={defaultAmount}
          placeholder="15000"
          required
          error={errors.amount}
        />
        <AdminField
          id="manual-paid-at"
          name="paidAt"
          label="Fecha de pago"
          type="date"
          defaultValue={today}
          max={today}
          required
          error={errors.paidAt}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="manual-months">Meses que cubre</Label>
          <select
            id="manual-months"
            name="months"
            defaultValue="1"
            aria-invalid={errors.months ? true : undefined}
            aria-describedby={errors.months ? "manual-months-error" : undefined}
            className={`${nativeFieldClass} h-9`}
          >
            {MONTHS.map((months) => (
              <option key={months} value={months}>
                {months === 1 ? "1 mes" : `${months} meses`}
              </option>
            ))}
          </select>
          <FieldError id="manual-months-error" message={errors.months} />
        </div>
      </div>
      <AdminField
        id="manual-note"
        name="note"
        label="Nota (opcional)"
        maxLength={500}
        placeholder="Transferencia desde la cuenta de…"
        error={errors.note}
      />
      <p className="text-xs text-muted-foreground">
        Extiende &quot;pagado hasta&quot; desde la fecha de pago (o desde el vencimiento actual, si es posterior). No cancela
        ni pausa la suscripción de Mercado Pago.
      </p>
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Registrando…" : "Registrar pago manual"}
      </Button>
      <FormStatus state={state} pending={pending} />
    </form>
  );
}
