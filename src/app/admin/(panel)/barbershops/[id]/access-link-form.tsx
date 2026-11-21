"use client";

import { useActionState } from "react";
import { createOwnerAccessLink, type AccessLinkResult } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";
import { InviteLink } from "@/app/(dashboard)/dashboard/barbers/invite-link";

export function AccessLinkForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<AccessLinkResult | undefined, FormData>(
    createOwnerAccessLink,
    undefined,
  );

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="outline" className="w-fit" disabled={pending}>
          {pending ? "Generando…" : "Nuevo link de acceso para el dueño"}
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
        <InviteLink invitePath={state.invitePath} barbershopName={state.barbershopName} barberName={state.ownerName} />
      ) : null}
    </div>
  );
}
