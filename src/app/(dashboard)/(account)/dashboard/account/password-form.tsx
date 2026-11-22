"use client";

import { useActionState } from "react";
import { changePassword } from "@/server/actions/account";
import type { ActionResult } from "@/lib/barbershop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus } from "@/app/(dashboard)/dashboard/settings/form-ui";

const FIELDS = [
  { name: "currentPassword", label: "Contraseña actual", autoComplete: "current-password" },
  { name: "newPassword", label: "Contraseña nueva", autoComplete: "new-password", help: "Al menos 8 caracteres." },
  { name: "confirmPassword", label: "Repetí la contraseña nueva", autoComplete: "new-password" },
] as const;

export function PasswordForm() {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(changePassword, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    // `key`: después de un cambio exitoso se vacían los campos.
    <form key={state?.ok ? "done" : "form"} action={action} className="flex flex-col gap-4" noValidate>
      {FIELDS.map((field) => (
        <div key={field.name} className="flex flex-col gap-2">
          <Label htmlFor={field.name}>{field.label}</Label>
          <Input
            id={field.name}
            name={field.name}
            type="password"
            autoComplete={field.autoComplete}
            maxLength={200}
            required
            aria-invalid={errors[field.name] ? true : undefined}
            aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
            className="h-11"
          />
          {"help" in field && !errors[field.name] ? (
            <p className="text-sm text-muted-foreground">{field.help}</p>
          ) : null}
          <FieldError id={`${field.name}-error`} message={errors[field.name]} />
        </div>
      ))}
      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </Button>
      <FormStatus state={state} pending={pending} />
    </form>
  );
}
