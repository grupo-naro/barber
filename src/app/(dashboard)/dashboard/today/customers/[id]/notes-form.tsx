"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CUSTOMER_NOTES_MAX } from "@/lib/records";
import { updateCustomerNotes, type NotesFormState } from "@/server/actions/records";
import { ResultMessage } from "../../fields";
import { nativeControlClass } from "../../format";

export function NotesForm({ customerId, notes }: { customerId: string; notes: string | null }) {
  const [state, action, pending] = useActionState<NotesFormState, FormData>(updateCustomerNotes, null);
  // Controlado: el texto no se pierde si el guardado falla.
  const [value, setValue] = useState(notes ?? "");
  const tooLong = value.trim().length > CUSTOMER_NOTES_MAX;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="customer-notes">Notas técnicas de corte</Label>
        <textarea
          id="customer-notes"
          name="notes"
          rows={5}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={nativeControlClass}
          placeholder="Ej.: 2 al costado, tijera arriba, sin raya."
          aria-invalid={tooLong || undefined}
          aria-describedby="customer-notes-count"
        />
        <p id="customer-notes-count" className={tooLong ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {value.trim().length}/{CUSTOMER_NOTES_MAX}
        </p>
      </div>
      <Button type="submit" size="lg" className="h-11 w-full sm:w-fit" disabled={pending || tooLong}>
        {pending ? "Guardando…" : "Guardar notas"}
      </Button>
      <ResultMessage state={state} pending={pending} />
    </form>
  );
}
