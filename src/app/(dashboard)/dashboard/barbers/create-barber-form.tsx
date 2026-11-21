"use client";

import { useActionState } from "react";
import { createBarber, type InviteResult } from "@/server/actions/barbers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "../settings/form-ui";
import { InviteLink } from "./invite-link";

export function CreateBarberForm({ barbershopName }: { barbershopName: string }) {
  const [state, action, pending] = useActionState<InviteResult | undefined, FormData>(createBarber, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <div className="flex flex-col gap-4">
      {/* `key` cambia con cada alta exitosa: el form se resetea para cargar el próximo. */}
      <form key={state?.ok ? state.invitePath : "form"} action={action} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="barber-name">Nombre</Label>
          <Input
            id="barber-name"
            name="name"
            autoComplete="off"
            maxLength={80}
            required
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "barber-name-error" : undefined}
            placeholder="Juan Pérez"
            className="h-11"
          />
          <FieldError id="barber-name-error" message={errors.name} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="barber-email">Email</Label>
          <Input
            id="barber-email"
            name="email"
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "barber-email-error" : undefined}
            placeholder="juan@ejemplo.com"
            className="h-11"
          />
          <FieldError id="barber-email-error" message={errors.email} />
          <p className="text-sm text-muted-foreground">Lo va a usar para ingresar. No le mandamos ningún email.</p>
        </div>
        <Button type="submit" size="lg" className="h-11" disabled={pending}>
          {pending ? "Creando…" : "Crear e invitar"}
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
