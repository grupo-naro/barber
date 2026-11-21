"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { regenerateInvitation, type InviteResult } from "@/server/actions/barbers";
import { Button } from "@/components/ui/button";
import { InviteLink } from "../invite-link";

/** "Generar nuevo link" para un barbero con invitación pendiente. Invalida los links anteriores. */
export function RegenerateInviteForm({ userId, barbershopName }: { userId: string; barbershopName: string }) {
  const [state, action, pending] = useActionState<InviteResult | undefined, FormData>(regenerateInvitation, undefined);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="userId" value={userId} />
        <Button type="submit" size="lg" variant="outline" className="h-11" disabled={pending}>
          <RefreshCw aria-hidden />
          {pending ? "Generando…" : "Generar nuevo link"}
        </Button>
        <p
          aria-live="polite"
          role="status"
          className={state && !state.ok ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {pending ? "" : state ? (state.ok ? state.message : state.error) : ""}
        </p>
      </form>
      {state?.ok ? (
        <InviteLink invitePath={state.invitePath} barbershopName={barbershopName} barberName={state.barberName} />
      ) : null}
    </div>
  );
}
