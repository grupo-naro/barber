"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getSession, type Session } from "@/lib/auth";
import {
  MAX_RANGES_PER_DAY,
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

/**
 * Franjas enviadas para un día: `opensAt-<weekday>-<i>` / `closesAt-<weekday>-<i>`. Lee una más
 * que el máximo para que Zod rechace un día con 3 franjas en vez de ignorarla en silencio.
 */
function rangesFromForm(formData: FormData, weekday: number) {
  const ranges: { opensAt: string | null; closesAt: string | null }[] = [];
  for (let i = 0; i <= MAX_RANGES_PER_DAY; i++) {
    const opensAt = text(formData, `opensAt-${weekday}-${i}`);
    const closesAt = text(formData, `closesAt-${weekday}-${i}`);
    if (opensAt === null && closesAt === null) continue;
    ranges.push({ opensAt, closesAt });
  }
  return ranges;
}

export async function updateOpeningHours(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const input = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    closed: formData.get(`open-${weekday}`) !== "on",
    ranges: rangesFromForm(formData, weekday),
  }));
  const parsed = openingHoursSchema.safeParse(input);
  if (!parsed.success) {
    const { byDay, form } = openingHoursErrors(parsed.error, input);
    return { ok: false, error: form ?? INVALID, fieldErrors: byDay };
  }

  const session = await ownerSession();
  if (!session) return FORBIDDEN;
  const { barbershopId } = session;

  // Una fila por franja; un día cerrado es una sola fila `closed` sin horas.
  const rows = parsed.data.flatMap((day): Prisma.OpeningHoursCreateManyInput[] =>
    day.closed
      ? [{ barbershopId, weekday: day.weekday, closed: true, opensAt: null, closesAt: null }]
      : day.ranges.map((range) => ({ barbershopId, weekday: day.weekday, closed: false, ...range })),
  );

  // Los 7 días o ninguno: borra SOLO las filas de la barbería de la sesión y crea las nuevas.
  await db.$transaction([
    db.openingHours.deleteMany({ where: { barbershopId } }),
    db.openingHours.createMany({ data: rows }),
  ]);

  revalidatePath(SETTINGS_PATH);
  return { ok: true, message: "Horarios guardados." };
}
