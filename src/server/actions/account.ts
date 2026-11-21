"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { firstFieldErrors, type ActionResult } from "@/lib/barbershop-settings";
import { changePasswordSchema } from "@/lib/barbers";

// "Mi cuenta": cualquier sesión válida. El usuario sale SIEMPRE de la sesión, nunca de un campo del form.

const WRONG_CURRENT = "La contraseña actual no es correcta.";

export async function changePassword(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Revisá los campos marcados.", fieldErrors: firstFieldErrors(parsed.error) };

  const session = await getSession();
  if (!session) return { ok: false, error: "Tu sesión venció. Volvé a ingresar." };

  const user = await db.user.findFirst({
    where: { id: session.userId, barbershopId: session.barbershopId },
    select: { id: true, passwordHash: true },
  });
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { ok: false, error: WRONG_CURRENT, fieldErrors: { currentPassword: WRONG_CURRENT } };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  // Condicionado al hash leído: si la contraseña cambió en el medio, no pisamos nada.
  const { count } = await db.user.updateMany({
    where: { id: user.id, barbershopId: session.barbershopId, passwordHash: user.passwordHash },
    data: { passwordHash },
  });
  if (count !== 1) return { ok: false, error: "No pudimos cambiar tu contraseña. Probá de nuevo." };

  return { ok: true, message: "Listo, cambiamos tu contraseña." };
}
