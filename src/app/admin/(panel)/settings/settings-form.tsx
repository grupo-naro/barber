"use client";

import { useActionState } from "react";
import { updatePlatformSettings } from "@/server/actions/admin-billing";
import type { ActionResult } from "@/lib/barbershop-settings";
import { Button } from "@/components/ui/button";
import { FormStatus } from "@/app/(dashboard)/dashboard/settings/form-ui";
import { AdminField } from "../field";

export type PlatformSettingsValues = {
  transferAlias: string;
  transferCbu: string;
  transferHolder: string;
  contactWhatsapp: string;
};

/** Datos de transferencia y WhatsApp de contacto que ve el dueño en la pantalla de pago. */
export function PlatformSettingsForm({ values }: { values: PlatformSettingsValues }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(updatePlatformSettings, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const current = state?.ok && state.values ? { ...values, ...state.values } : values;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <AdminField
        id="transferAlias"
        name="transferAlias"
        label="Alias"
        defaultValue={current.transferAlias}
        maxLength={60}
        autoCapitalize="none"
        spellCheck={false}
        error={errors.transferAlias}
      />
      <AdminField
        id="transferCbu"
        name="transferCbu"
        label="CBU / CVU"
        inputMode="numeric"
        defaultValue={current.transferCbu}
        maxLength={30}
        error={errors.transferCbu}
        hint="22 dígitos."
      />
      <AdminField
        id="transferHolder"
        name="transferHolder"
        label="Titular de la cuenta"
        defaultValue={current.transferHolder}
        maxLength={100}
        error={errors.transferHolder}
      />
      <AdminField
        id="contactWhatsapp"
        name="contactWhatsapp"
        label="WhatsApp de contacto"
        type="tel"
        inputMode="tel"
        defaultValue={current.contactWhatsapp}
        maxLength={30}
        placeholder="+54 9 11 1234-5678"
        error={errors.contactWhatsapp}
        hint="Para el botón “Ya transferí”. Con código de país."
      />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <p className="text-xs text-muted-foreground">Dejá un campo vacío para no mostrarlo.</p>
        <Button type="submit" className="w-fit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar ajustes"}
        </Button>
        <FormStatus state={state} pending={pending} />
      </div>
    </form>
  );
}
