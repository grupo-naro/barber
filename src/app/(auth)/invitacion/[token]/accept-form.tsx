"use client";

import { useActionState } from "react";
import Link from "next/link";
import { acceptInvitation, type AcceptInvitationState } from "@/server/actions/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AcceptInvitationForm({ token, reset = false }: { token: string; reset?: boolean }) {
  const [state, action, pending] = useActionState<AcceptInvitationState, FormData>(acceptInvitation, undefined);
  const errors = state?.fieldErrors ?? {};

  if (state?.invalidLink) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
        <Link href="/login" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
          Ir a ingresar
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{reset ? "Nueva contraseña" : "Contraseña"}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={200}
          required
          aria-invalid={errors.password ? true : undefined}
          aria-describedby="password-help"
          className="h-11"
        />
        <p id="password-help" className={errors.password ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {errors.password ?? "Al menos 8 caracteres."}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Repetí la contraseña</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={errors.confirmPassword ? true : undefined}
          aria-describedby={errors.confirmPassword ? "confirm-error" : undefined}
          className="h-11"
        />
        {errors.confirmPassword ? (
          <p id="confirm-error" className="text-sm text-destructive">
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>
      {state?.error && !state.fieldErrors ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        {pending ? (reset ? "Guardando…" : "Activando…") : reset ? "Guardar y entrar" : "Activar mi cuenta"}
      </Button>
    </form>
  );
}
