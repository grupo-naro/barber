"use client";

import { useActionState } from "react";
import { adminLogin, type AdminLoginState } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState<AdminLoginState, FormData>(adminLogin, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-email">Email</Label>
        <Input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "admin-login-error" : undefined}
          defaultValue={state?.email}
          className="h-10"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="admin-password">Contraseña</Label>
        <Input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? "admin-login-error" : undefined}
          className="h-10"
        />
      </div>
      {state?.error ? (
        <p id="admin-login-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
