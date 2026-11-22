"use client";

import { useActionState } from "react";
import { markDuplicateReviewed } from "@/server/actions/admin-billing";
import type { ActionResult } from "@/lib/barbershop-settings";
import { Button } from "@/components/ui/button";

/** "Marcar revisado" de un pago con posible cobro doble. */
export function MarkReviewedButton({ id, paymentId }: { id: string; paymentId: string }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(markDuplicateReviewed, undefined);

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <Button type="submit" size="sm" variant="outline" className="w-fit" disabled={pending}>
        {pending ? "Guardando…" : "Marcar revisado"}
      </Button>
      <p aria-live="polite" role="status" className="text-xs text-destructive">
        {!pending && state && !state.ok ? state.error : ""}
      </p>
    </form>
  );
}
