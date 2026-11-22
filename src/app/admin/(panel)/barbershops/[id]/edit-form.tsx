"use client";

import { useActionState } from "react";
import { updateBarbershop } from "@/server/actions/admin";
import type { ActionResult } from "@/lib/barbershop-settings";
import { PLAN_LABELS, PLANS, type PlanValue } from "@/lib/platform-admin";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus, nativeFieldClass } from "@/app/(dashboard)/dashboard/settings/form-ui";
import { AdminField } from "../../field";

export type EditBarbershopValues = {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  plan: PlanValue;
  /** "YYYY-MM-DD" en la timezone de la barbería, o "". */
  planExpiresAt: string;
};

export function EditBarbershopForm({
  values,
  hasOwner,
  billingEnabled,
}: {
  values: EditBarbershopValues;
  hasOwner: boolean;
  /** Con el cobro activado, "pagado hasta" solo cambia con pagos: el campo no se muestra (y el servidor lo ignora). */
  billingEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(updateBarbershop, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="id" value={values.id} />
      <AdminField id="name" name="name" label="Nombre" defaultValue={values.name} maxLength={80} required error={errors.name} />
      <AdminField
        id="slug"
        name="slug"
        label="Slug"
        defaultValue={values.slug}
        maxLength={40}
        required
        autoCapitalize="none"
        spellCheck={false}
        error={errors.slug}
        hint="Si lo cambiás, la dirección vieja deja de funcionar."
      />
      <AdminField
        id="ownerEmail"
        name="ownerEmail"
        label="Email del dueño"
        type="email"
        defaultValue={values.ownerEmail}
        autoCapitalize="none"
        spellCheck={false}
        required
        disabled={!hasOwner}
        error={errors.ownerEmail}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan">Plan</Label>
        <select
          id="plan"
          name="plan"
          defaultValue={values.plan}
          aria-invalid={errors.plan ? true : undefined}
          aria-describedby={errors.plan ? "plan-error" : undefined}
          className={`${nativeFieldClass} h-9`}
        >
          {PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {PLAN_LABELS[plan]}
            </option>
          ))}
        </select>
        <FieldError id="plan-error" message={errors.plan} />
      </div>
      {billingEnabled ? (
        <p className="self-end text-sm text-muted-foreground">
          El vencimiento (&quot;pagado hasta&quot;) lo mueven los pagos: registrá un pago manual en Suscripción.
        </p>
      ) : (
        <AdminField
          id="planExpiresAt"
          name="planExpiresAt"
          label="Vencimiento del plan"
          type="date"
          defaultValue={values.planExpiresAt}
          error={errors.planExpiresAt}
          hint="Opcional: dejalo vacío para que no venza. Solo le muestra un aviso al dueño."
        />
      )}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" className="w-fit" disabled={pending || !hasOwner}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
        <FormStatus state={state} pending={pending} />
      </div>
    </form>
  );
}
