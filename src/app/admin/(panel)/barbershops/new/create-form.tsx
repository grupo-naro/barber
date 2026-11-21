"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createBarbershop, type AccessLinkResult } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";
import { suggestSlug } from "@/lib/platform-admin";
import { InviteLink } from "@/app/(dashboard)/dashboard/barbers/invite-link";
import { AdminField } from "../../field";

export function CreateBarbershopForm() {
  const [state, action, pending] = useActionState<AccessLinkResult | undefined, FormData>(createBarbershop, undefined);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  // El slug se sugiere desde el nombre hasta que el admin lo edita a mano.
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm">
          {state.message}
        </p>
        <InviteLink invitePath={state.invitePath} barbershopName={state.barbershopName} barberName={state.ownerName} />
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={`/admin/barbershops/${state.barbershopId}`} className="underline underline-offset-4">
            Ver la barbería
          </Link>
          <Link href="/admin" className="underline underline-offset-4">
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <AdminField
        id="name"
        name="name"
        label="Nombre de la barbería"
        maxLength={80}
        required
        error={errors.name}
        onChange={(event) => {
          if (!slugTouched) setSlug(suggestSlug(event.currentTarget.value));
        }}
      />
      <AdminField
        id="slug"
        name="slug"
        label="Slug"
        maxLength={40}
        required
        value={slug}
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(event.currentTarget.value);
        }}
        autoCapitalize="none"
        spellCheck={false}
        error={errors.slug}
        hint="La dirección pública: /<slug>. Se sugiere desde el nombre; minúsculas, números y guiones."
      />
      <AdminField id="ownerName" name="ownerName" label="Nombre del dueño" maxLength={80} required error={errors.ownerName} />
      <AdminField
        id="ownerEmail"
        name="ownerEmail"
        label="Email del dueño"
        type="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={errors.ownerEmail}
        hint="Lo va a usar para ingresar. No mandamos ningún email."
      />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" className="w-fit" disabled={pending}>
          {pending ? "Creando…" : "Crear barbería e invitar al dueño"}
        </Button>
        <p aria-live="polite" role="status" className="text-sm text-destructive">
          {!pending && state && !state.ok ? state.error : ""}
        </p>
      </div>
    </form>
  );
}
