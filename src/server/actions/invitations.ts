"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { firstFieldErrors } from "@/lib/barbershop-settings";
import { choosePasswordSchema } from "@/lib/barbers";
import {
  INVALID_INVITATION_MESSAGE,
  hashInvitationToken,
  isInvitationUsable,
  isPlausibleInvitationToken,
} from "@/lib/invitations";

// Aceptar una invitación: ruta PÚBLICA que crea una sesión. Todo se revalida en el servidor; el token se busca
// por su hash único, es de un solo uso y la sesión sale del `User` en la DB (nunca de datos del form).

export type AcceptInvitationState =
  | { ok: false; error: string; fieldErrors?: Record<string, string>; invalidLink?: boolean }
  | undefined;

const INVALID_LINK: AcceptInvitationState = { ok: false, error: INVALID_INVITATION_MESSAGE, invalidLink: true };

class InvitationAlreadyUsed extends Error {}

export async function acceptInvitation(
  _prev: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const tokenRaw = formData.get("token");
  const token = typeof tokenRaw === "string" ? tokenRaw : "";
  if (!isPlausibleInvitationToken(token)) return INVALID_LINK;

  const parsed = choosePasswordSchema.safeParse({
    password: formData.get("password") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "Revisá los campos marcados.", fieldErrors: firstFieldErrors(parsed.error) };
  }

  const now = new Date();
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: await hashInvitationToken(token) },
    select: {
      id: true,
      userId: true,
      barbershopId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { barbershopId: true, passwordHash: true, active: true } },
    },
  });
  if (
    !invitation ||
    !isInvitationUsable(invitation, now) ||
    invitation.user.passwordHash !== null ||
    !invitation.user.active ||
    invitation.user.barbershopId !== invitation.barbershopId
  ) {
    return INVALID_LINK;
  }

  // scrypt fuera de la transacción para no tenerla abierta mientras se deriva la clave.
  const passwordHash = await hashPassword(parsed.data.password);

  let user: { id: string; barbershopId: string; role: "OWNER" | "BARBER" };
  try {
    user = await db.$transaction(async (tx) => {
      // Un solo uso: solo gana el envío que pasa `usedAt` de null a now (dos envíos concurrentes → uno falla).
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new InvitationAlreadyUsed();

      const updated = await tx.user.updateMany({
        where: { id: invitation.userId, barbershopId: invitation.barbershopId, passwordHash: null, active: true },
        data: { passwordHash },
      });
      if (updated.count !== 1) throw new InvitationAlreadyUsed();

      // Cualquier otro link pendiente de este usuario deja de servir.
      await tx.invitation.updateMany({ where: { userId: invitation.userId, usedAt: null }, data: { usedAt: now } });

      return tx.user.findUniqueOrThrow({
        where: { id: invitation.userId },
        select: { id: true, barbershopId: true, role: true },
      });
    });
  } catch (error) {
    if (error instanceof InvitationAlreadyUsed) return INVALID_LINK;
    throw error;
  }

  await createSession(user);
  redirect("/dashboard/today");
}
