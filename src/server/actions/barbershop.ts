"use server";

import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { getSession, type Session } from "@/lib/auth";
import {
  firstFieldErrors,
  openingHoursErrors,
  openingHoursSchema,
  profileSchema,
  type ActionResult,
} from "@/lib/barbershop-settings";
import { barbershopBrandingTag } from "@/app/[slug]/data";

// Mutaciones del panel de configuración (la liquidación por barbero está en `actions/barbers.ts`).
// Orden fijo: Zod `safeParse` → sesión y rol OWNER → query con el `barbershopId` de la SESIÓN
// (nunca de un campo del formulario).

const SETTINGS_PATH = "/dashboard/settings";
const FORBIDDEN: ActionResult = { ok: false, error: "No tenés permiso para cambiar la configuración." };
const INVALID = "Revisá los campos marcados.";

/** Sesión de un OWNER activo o `null`. Devuelve error en vez de redirigir para que el form lo muestre. */
async function ownerSession(): Promise<Session | null> {
  const session = await getSession();
  return session && session.role === "OWNER" ? session : null;
}

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

export async function updateBarbershopProfile(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = profileSchema.safeParse({
    name: text(formData, "name") ?? "",
    description: text(formData, "description"),
    address: text(formData, "address"),
    whatsapp: text(formData, "whatsapp"),
  });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error) };

  const session = await ownerSession();
  if (!session) return FORBIDDEN;

  // `logoUrl` no se escribe acá: el logo se sube desde "Página pública" (actions/landing.ts).
  await db.barbershop.update({
    where: { id: session.barbershopId },
    data: parsed.data,
  });

  // Read-your-own-writes: la próxima carga de `/<slug>` ya ve el branding nuevo.
  updateTag(barbershopBrandingTag(session.barbershop.slug));
  revalidatePath(SETTINGS_PATH);
  return { ok: true, message: "Perfil guardado." };
}

export async function updateOpeningHours(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const input = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    closed: formData.get(`closed-${weekday}`) === "on",
    opensAt: text(formData, `opensAt-${weekday}`),
    closesAt: text(formData, `closesAt-${weekday}`),
  }));
  const parsed = openingHoursSchema.safeParse(input);
  if (!parsed.success) {
    const { byDay, form } = openingHoursErrors(parsed.error, input);
    return { ok: false, error: form ?? INVALID, fieldErrors: byDay };
  }

  const session = await ownerSession();
  if (!session) return FORBIDDEN;
  const { barbershopId } = session;

  // Los 7 días o ninguno.
  await db.$transaction(
    parsed.data.map((day) =>
      db.openingHours.upsert({
        where: { barbershopId_weekday: { barbershopId, weekday: day.weekday } },
        create: { barbershopId, ...day },
        update: { closed: day.closed, opensAt: day.opensAt, closesAt: day.closesAt },
      }),
    ),
  );

  revalidatePath(SETTINGS_PATH);
  return { ok: true, message: "Horarios guardados." };
}
