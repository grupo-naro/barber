"use client";

import { useActionState, useState } from "react";
import { updateBarber } from "@/server/actions/barbers";
import {
  PAYOUT_SCHEMES,
  PAYOUT_SCHEME_LABELS,
  normalizeDecimal,
  type ActionResult,
  type PayoutSchemeValue,
} from "@/lib/barbershop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus, nativeFieldClass } from "../../settings/form-ui";

type Props = {
  user: { id: string; name: string; payoutScheme: PayoutSchemeValue; payoutValue: string };
};

/** Nombre + liquidación. El `userId` del hidden se vuelve a filtrar por el `barbershopId` de la sesión. */
export function BarberForm({ user }: Props) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(updateBarber, undefined);
  const [scheme, setScheme] = useState<PayoutSchemeValue>(user.payoutScheme);
  const [value, setValue] = useState(
    user.payoutScheme === "NONE" ? "" : (normalizeDecimal(user.payoutValue) ?? user.payoutValue),
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="userId" value={user.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="barber-name">Nombre</Label>
        <Input
          id="barber-name"
          name="name"
          defaultValue={user.name}
          maxLength={80}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "barber-name-error" : undefined}
          className="h-11"
        />
        <FieldError id="barber-name-error" message={errors.name} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Liquidación</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor="payout-scheme">Esquema</Label>
          <select
            id="payout-scheme"
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
          <FieldError id="payout-scheme-error" message={errors.payoutScheme} />
        </div>

        {scheme === "NONE" ? (
          <p className="text-sm text-muted-foreground">No se le liquida nada.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="payout-value">{scheme === "PERCENTAGE" ? "Porcentaje (%)" : "Alquiler ($)"}</Label>
            <div className="flex items-center gap-2">
              {scheme === "FIXED_RENT" ? (
                <span aria-hidden className="text-muted-foreground">
                  $
                </span>
              ) : null}
              <Input
                id="payout-value"
                name="payoutValue"
                inputMode="decimal"
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={scheme === "PERCENTAGE" ? "50" : "120000"}
                aria-invalid={errors.payoutValue ? true : undefined}
                aria-describedby={errors.payoutValue ? "payout-value-error" : undefined}
                className="h-11"
              />
              {scheme === "PERCENTAGE" ? (
                <span aria-hidden className="text-muted-foreground">
                  %
                </span>
              ) : null}
            </div>
            <FieldError id="payout-value-error" message={errors.payoutValue} />
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Porcentaje: cobra ese % de lo que factura. Alquiler fijo: paga un monto por la silla y se queda el resto.
        </p>
      </fieldset>

      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
      <FormStatus state={state} pending={pending} />
    </form>
  );
}
