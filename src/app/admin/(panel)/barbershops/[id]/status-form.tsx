"use client";

import { useActionState } from "react";
import { setBarbershopStatus } from "@/server/actions/admin";
import type { ActionResult } from "@/lib/barbershop-settings";
import type { BarbershopStatusValue } from "@/lib/platform-admin";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/app/(dashboard)/dashboard/settings/form-ui";

const SUSPEND_CONFIRM = "¿Suspender esta barbería? Su panel, su página y sus reservas dejan de funcionar.";

export function StatusForm({ id, status }: { id: string; status: BarbershopStatusValue }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(setBarbershopStatus, undefined);
  const suspend = status === "ACTIVE";

  return (
    <form
      action={action}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        if (suspend && !window.confirm(SUSPEND_CONFIRM)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={suspend ? "SUSPENDED" : "ACTIVE"} />
      <Button type="submit" variant={suspend ? "destructive" : "default"} className="w-fit" disabled={pending}>
        {pending ? "Guardando…" : suspend ? "Suspender barbería" : "Reactivar barbería"}
      </Button>
      <FormStatus state={state} pending={pending} />
    </form>
  );
}
