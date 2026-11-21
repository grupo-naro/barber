"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { updateBarbershopProfile } from "@/server/actions/barbershop";
import type { ActionResult } from "@/lib/barbershop-settings";
import type { SettingsProfile } from "@/server/queries/barbershop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus, nativeFieldClass } from "./form-ui";

type Field = "name" | "description" | "address" | "whatsapp";

export function ProfileForm({ profile }: { profile: SettingsProfile }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    updateBarbershopProfile,
    undefined,
  );
  // Controlados: si el guardado falla, lo que escribió el usuario no se pierde.
  const [values, setValues] = useState<Record<Field, string>>({
    name: profile.name,
    description: profile.description ?? "",
    address: profile.address ?? "",
    whatsapp: profile.whatsapp ?? "",
  });
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const bind = (field: Field) => ({
    id: `profile-${field}`,
    name: field,
    value: values[field],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value })),
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `profile-${field}-error` : undefined,
  });

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-name">Nombre</Label>
        <Input {...bind("name")} required maxLength={80} autoComplete="organization" className="h-11" />
        <FieldError id="profile-name-error" message={errors.name} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-description">Descripción</Label>
        <textarea {...bind("description")} rows={3} maxLength={500} className={`${nativeFieldClass} min-h-24 py-2`} />
        <p className="text-xs text-muted-foreground">{values.description.length}/500</p>
        <FieldError id="profile-description-error" message={errors.description} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-address">Dirección</Label>
        <Input {...bind("address")} maxLength={200} autoComplete="street-address" className="h-11" />
        <FieldError id="profile-address-error" message={errors.address} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-whatsapp">WhatsApp</Label>
        <Input
          {...bind("whatsapp")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+54 9 11 1234-5678"
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">Con código de país, sin el 15. Se guarda solo con números.</p>
        <FieldError id="profile-whatsapp-error" message={errors.whatsapp} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" className="h-11 px-4" disabled={pending}>
          {pending ? "Guardando…" : "Guardar perfil"}
        </Button>
        <FormStatus state={state} pending={pending} />
      </div>
    </form>
  );
}
