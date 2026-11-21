"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
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
import { invitationAllowsUser } from "@/lib/platform-admin";

// Aceptar una invitación: ruta PÚBLICA que crea una sesión. Todo se revalida en el servidor; el token se busca
// por su hash único, es de un solo uso y la sesión sale del `User` en la DB (nunca de datos del form).

export type AcceptInvitationState =
  | { ok: false; error: string; fieldErrors?: Record<string, string>; invalidLink?: boolean }
  | undefined;

const INVALID_LINK: AcceptInvitationState = { ok: false, error: INVALID_INVITATION_MESSAGE, invalidLink: true };

const tokenSchema = z.string().refine(isPlausibleInvitationToken);

class InvitationAlreadyUsed extends Error {}

export async function acceptInvitation(
  _prev: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const tokenParsed = tokenSchema.safeParse(formData.get("token"));
  if (!tokenParsed.success) return INVALID_LINK;
  const token = tokenParsed.data;

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
      kind: true,
      userId: true,
      barbershopId: true,
      expiresAt: true,
      usedAt: true,
      barbershop: { select: { status: true } },
      user: { select: { barbershopId: true, passwordHash: true, active: true } },
    },
  });
  // INVITE: el usuario no tiene contraseña. RESET (nuevo acceso del dueño): la pisa. Barbería suspendida → no.
  if (!invitation || !isInvitationUsable(invitation, now) || !invitationAllowsUser(invitation)) {
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
        where: {
          id: invitation.userId,
          barbershopId: invitation.barbershopId,
          active: true,
          // Un INVITE solo activa una cuenta sin contraseña; un RESET pisa la que haya.
          ...(invitation.kind === "INVITE" ? { passwordHash: null } : {}),
          barbershop: { status: "ACTIVE" },
        },
        // `passwordChangedAt`: un RESET cierra las sesiones previas; la que se crea abajo es posterior y vale.
        data: { passwordHash, passwordChangedAt: now, lastLoginAt: now },
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
