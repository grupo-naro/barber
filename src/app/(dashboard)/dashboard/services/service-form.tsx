"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createService,
  updateService,
  type ServiceField,
  type ServiceFormState,
} from "@/server/actions/services";
import { nativeControlClass } from "./format";

export type ServiceFormDefaults = Record<ServiceField, string>;

const EMPTY: ServiceFormDefaults = {
  name: "",
  description: "",
  price: "",
  durationMinutes: "30",
  showOnline: "on",
  sortOrder: "0",
};

type Props = { service?: { id: string; values: ServiceFormDefaults } };

export function ServiceForm({ service }: Props) {
  const isEdit = Boolean(service);
  const [state, action, pending] = useActionState<ServiceFormState, FormData>(
    isEdit ? updateService : createService,
    null,
  );
  // Tras un error se re-muestra lo que mandó el usuario; tras un alta exitosa, el formulario vacío.
  const values = state?.values ?? service?.values ?? EMPTY;
  const errors = state?.fieldErrors ?? {};
  const prefix = isEdit ? "edit" : "new";

  const fieldProps = (field: ServiceField) => ({
    id: `${prefix}-${field}`,
    name: field,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? `${prefix}-${field}-error` : undefined,
  });
  const fieldError = (field: ServiceField) =>
    errors[field] ? (
      <p id={`${prefix}-${field}-error`} className="text-sm text-destructive">
        {errors[field]}
      </p>
    ) : null;

  return (
    <form key={state?.nonce ?? 0} action={action} className="flex flex-col gap-4" noValidate>
      {service ? <input type="hidden" name="id" value={service.id} /> : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-name`}>Nombre</Label>
        <Input {...fieldProps("name")} defaultValue={values.name} maxLength={80} required className="h-11" placeholder="Corte clásico" />
        {fieldError("name")}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-description`}>
          Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <textarea
          {...fieldProps("description")}
          defaultValue={values.description}
          maxLength={500}
          rows={3}
          className={nativeControlClass}
          placeholder="Lo que ve el cliente en la web de reservas"
        />
        {fieldError("description")}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-price`}>Precio ($)</Label>
          <Input
            {...fieldProps("price")}
            defaultValue={values.price}
            inputMode="decimal"
            autoComplete="off"
            required
            className="h-11"
            placeholder="12000"
          />
          {fieldError("price")}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-durationMinutes`}>Duración (min)</Label>
          <Input
            {...fieldProps("durationMinutes")}
            defaultValue={values.durationMinutes}
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            required
            className="h-11"
          />
          {fieldError("durationMinutes")}
        </div>
      </div>

      <div className="grid grid-cols-2 items-start gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-sortOrder`}>Orden</Label>
          <Input
            {...fieldProps("sortOrder")}
            defaultValue={values.sortOrder}
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            className="h-11"
          />
          {fieldError("sortOrder")}
          <p className="text-xs text-muted-foreground">Los números más bajos aparecen primero.</p>
        </div>
        <label className="mt-6 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-3 text-sm font-medium">
          <input
            type="checkbox"
            name="showOnline"
            defaultChecked={values.showOnline === "on"}
            className="size-5 accent-primary"
          />
          Mostrar en la web
        </label>
      </div>

      {state && !state.ok && state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      {state?.ok && state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {isEdit ? (
          <Link href="/dashboard/services" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
            Cancelar
          </Link>
        ) : null}
        <Button type="submit" size="lg" className="h-11" disabled={pending}>
          {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear servicio"}
        </Button>
      </div>
    </form>
  );
}
