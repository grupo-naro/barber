"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { closeCashRegister, type CloseCashState } from "@/server/actions/cash";
import { nativeControlClass } from "../services/format";

export function CloseCashForm({
  date,
  dateLabel,
  totalLabel,
  debtors,
}: {
  date: string;
  dateLabel: string;
  totalLabel: string;
  /** Barberos que quedan debiendo a la barbería (FIXED_RENT con saldo negativo). */
  debtors: number;
}) {
  const [state, action, pending] = useActionState<CloseCashState, FormData>(closeCashRegister, null);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const lines = [`¿Cerrar la caja del ${dateLabel}?`, `Total: ${totalLabel}`];
        if (debtors === 1) lines.push("1 barbero queda debiendo a la barbería.");
        if (debtors > 1) lines.push(`${debtors} barberos quedan debiendo a la barbería.`);
        lines.push("Después no se puede modificar.");
        if (!window.confirm(lines.join("\n"))) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="date" value={date} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="cash-notes">Notas (opcional)</Label>
        <textarea
          id="cash-notes"
          name="notes"
          rows={3}
          maxLength={500}
          placeholder="Ej.: faltaron $500 de cambio"
          className={nativeControlClass}
        />
      </div>
      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        <Lock />
        {pending ? "Cerrando…" : "Cerrar caja"}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-sm font-medium">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
