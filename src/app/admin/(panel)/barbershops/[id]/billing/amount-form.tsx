"use client";

import { useActionState } from "react";
import { changeSubscriptionAmount } from "@/server/actions/admin-billing";
import type { ActionResult } from "@/lib/barbershop-settings";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/app/(dashboard)/dashboard/settings/form-ui";
import { AdminField } from "../../../field";

/** Cambiar el monto mensual (también en MP si hay una suscripción no cancelada). */
export function ChangeAmountForm({
  id,
  defaultAmount,
  syncsWithMp,
}: {
  id: string;
  defaultAmount: string;
  syncsWithMp: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(changeSubscriptionAmount, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  // Tras un error, lo que se envió (React resetea el form después de la action, también si falla).
  const sent = state && !state.ok ? state.values : undefined;

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="id" value={id} />
      <AdminField
        id="change-amount"
        name="amount"
        label="Nuevo monto mensual (ARS)"
        inputMode="decimal"
        defaultValue={sent?.amount ?? defaultAmount}
        placeholder="15000"
        required
        error={errors.amount}
        hint={
          syncsWithMp
            ? "Se actualiza también en Mercado Pago: el próximo cobro sale con este monto."
            : "No hay suscripción activa en Mercado Pago: se usa al generar el link."
        }
      />
      <Button type="submit" variant="outline" className="w-fit" disabled={pending}>
        {pending ? "Guardando…" : "Cambiar monto"}
      </Button>
      <FormStatus state={state} pending={pending} />
    </form>
  );
}
