"use client";

import { useActionState, useState } from "react";
import { updateBarberPayout } from "@/server/actions/barbershop";
import {
  PAYOUT_SCHEMES,
  PAYOUT_SCHEME_LABELS,
  normalizeDecimal,
  type ActionResult,
  type PayoutSchemeValue,
} from "@/lib/barbershop-settings";
import type { SettingsUser } from "@/server/queries/barbershop";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus, nativeFieldClass } from "./form-ui";

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const pct = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** Regla vigente en texto. Formatear para mostrar es lo único que pasa por `Number`. */
function describePayout(scheme: PayoutSchemeValue, value: string): string {
  if (scheme === "PERCENTAGE") return `${pct.format(Number(value))} % de lo facturado`;
  if (scheme === "FIXED_RENT") return `Alquiler fijo de ${ars.format(Number(value))}`;
  return "Sin liquidación";
}

export function PayoutList({ users }: { users: SettingsUser[] }) {
  if (users.length === 0) return <p className="text-muted-foreground">Todavía no hay usuarios en tu barbería.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {users.map((user) => (
        <li key={user.id} className="py-4 first:pt-0 last:pb-0">
          <PayoutRow user={user} />
        </li>
      ))}
    </ul>
  );
}

function PayoutRow({ user }: { user: SettingsUser }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    updateBarberPayout,
    undefined,
  );
  const [scheme, setScheme] = useState<PayoutSchemeValue>(user.payoutScheme);
  const [value, setValue] = useState(
    user.payoutScheme === "NONE" ? "" : (normalizeDecimal(user.payoutValue) ?? user.payoutValue),
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const prefix = `payout-${user.id}`;
  const valueError = errors.payoutValue;

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="userId" value={user.id} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-words">{user.name}</span>
        {user.role === "OWNER" ? <Badge variant="secondary">Dueño/a</Badge> : null}
        {!user.active ? <Badge variant="outline">Inactivo</Badge> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Actual: {describePayout(user.payoutScheme, user.payoutValue)}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-scheme`}>Esquema</Label>
          <select
            id={`${prefix}-scheme`}
            name="payoutScheme"
            value={scheme}
            onChange={(e) => setScheme(e.target.value as PayoutSchemeValue)}
            aria-invalid={errors.payoutScheme ? true : undefined}
            className={`${nativeFieldClass} h-11 bg-background`}
          >
            {PAYOUT_SCHEMES.map((s) => (
              <option key={s} value={s}>
                {PAYOUT_SCHEME_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {scheme === "NONE" ? (
          <p className="flex min-h-11 items-center text-sm text-muted-foreground sm:self-end">No se le liquida nada.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${prefix}-value`}>{scheme === "PERCENTAGE" ? "Porcentaje (%)" : "Alquiler ($)"}</Label>
            <div className="flex items-center gap-2">
              {scheme === "FIXED_RENT" ? (
                <span aria-hidden className="text-muted-foreground">
                  $
                </span>
              ) : null}
              <Input
                id={`${prefix}-value`}
                name="payoutValue"
                inputMode="decimal"
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={scheme === "PERCENTAGE" ? "50" : "120000"}
                aria-invalid={valueError ? true : undefined}
                aria-describedby={valueError ? `${prefix}-value-error` : undefined}
                className="h-11"
              />
              {scheme === "PERCENTAGE" ? (
                <span aria-hidden className="text-muted-foreground">
                  %
                </span>
              ) : null}
            </div>
          </div>
        )}

        <Button type="submit" size="lg" variant="outline" className="h-11 px-4" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      <FieldError id={`${prefix}-value-error`} message={valueError} />
      <FormStatus state={state} pending={pending} />
    </form>
  );
}
