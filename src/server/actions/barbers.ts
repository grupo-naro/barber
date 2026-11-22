"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getSession, type Session } from "@/lib/auth";
import { requirePanelAccess } from "@/lib/billing-access";
import { firstFieldErrors, type ActionResult } from "@/lib/barbershop-settings";
import { createBarberSchema, regenerateInvitationSchema, updateBarberSchema } from "@/lib/barbers";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  invitationPath,
} from "@/lib/invitations";

// Gestión de barberos (solo OWNER). Orden fijo: Zod `safeParse` → sesión OWNER → query con el
// `barbershopId` de la SESIÓN. Todo `userId` del form se filtra además por ese `barbershopId` (IDOR).

const BARBERS_PATH = "/dashboard/barbers";
const FORBIDDEN = "No tenés permiso para gestionar barberos.";
const INVALID = "Revisá los campos marcados.";
const NOT_FOUND = "No encontramos ese usuario en tu barbería.";
const EMAIL_UNAVAILABLE = "Ese email no está disponible.";

/**
 * Resultado de crear un barbero o regenerar su link. `invitePath` (`/invitacion/<token>`) viaja una sola vez
 * en esta respuesta: en la DB solo queda el hash, así que al recargar ya no se puede volver a mostrar.
 */
export type InviteResult =
  | { ok: true; message: string; invitePath: string; barberName: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function ownerSession(): Promise<Session | null> {
  const session = await getSession();
  if (!session || session.role !== "OWNER") return null;
  // Panel bloqueado por cobro → `/dashboard` (pantalla de pago), antes de cualquier lectura o escritura.
  requirePanelAccess(session);
  return session;
}

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Token nuevo para el usuario. Devuelve el token crudo (para el link) y los datos a guardar (solo el hash). */
async function newInvitation(now: Date) {
  const token = generateInvitationToken();
  return { token, tokenHash: await hashInvitationToken(token), expiresAt: invitationExpiresAt(now) };
}

export async function createBarber(_prev: InviteResult | undefined, formData: FormData): Promise<InviteResult> {
  const parsed = createBarberSchema.safeParse({ name: text(formData, "name") ?? "", email: text(formData, "email") ?? "" });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error) };

  const session = await ownerSession();
  if (!session) return { ok: false, error: FORBIDDEN };
  const { barbershopId } = session;

  // El email es único entre TODAS las barberías: el mensaje es genérico para no revelar en cuál existe.
  const existing = await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) return { ok: false, error: EMAIL_UNAVAILABLE, fieldErrors: { email: EMAIL_UNAVAILABLE } };

  const invite = await newInvitation(new Date());
  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          barbershopId,
          name: parsed.data.name,
          email: parsed.data.email,
          role: "BARBER",
          passwordHash: null,
        },
        select: { id: true },
      });
      await tx.invitation.create({
        data: { userId: user.id, barbershopId, tokenHash: invite.tokenHash, expiresAt: invite.expiresAt },
      });
    });
  } catch (error) {
    // Carrera con otro alta del mismo email: la transacción no dejó nada creado.
    if (isUniqueViolation(error)) {
      return { ok: false, error: EMAIL_UNAVAILABLE, fieldErrors: { email: EMAIL_UNAVAILABLE } };
    }
    throw error;
  }

  revalidatePath(BARBERS_PATH);
  return {
    ok: true,
    message: `Listo, agregamos a ${parsed.data.name}. Mandale el link para que elija su contraseña.`,
    invitePath: invitationPath(invite.token),
    barberName: parsed.data.name,
  };
}

export async function regenerateInvitation(_prev: InviteResult | undefined, formData: FormData): Promise<InviteResult> {
  const parsed = regenerateInvitationSchema.safeParse({ userId: text(formData, "userId") ?? "" });
  if (!parsed.success) return { ok: false, error: NOT_FOUND };
  const { userId } = parsed.data;

  const session = await ownerSession();
  if (!session) return { ok: false, error: FORBIDDEN };
  const { barbershopId } = session;

  const user = await db.user.findFirst({
    where: { id: userId, barbershopId },
    select: { id: true, name: true, role: true, passwordHash: true },
  });
  if (!user) return { ok: false, error: NOT_FOUND };
  if (user.role !== "BARBER" || user.passwordHash !== null) {
    return { ok: false, error: "Este barbero ya activó su cuenta: no hace falta un link nuevo." };
  }

  const now = new Date();
  const invite = await newInvitation(now);
  const created = await db.$transaction(async (tx) => {
    // Re-chequeo dentro de la transacción: si aceptó la invitación mientras tanto, no se genera otra.
    const stillPending = await tx.user.count({ where: { id: user.id, barbershopId, passwordHash: null } });
    if (stillPending !== 1) return false;
    // Los links anteriores sin usar dejan de servir.
    await tx.invitation.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await tx.invitation.create({
      data: { userId: user.id, barbershopId, tokenHash: invite.tokenHash, expiresAt: invite.expiresAt },
    });
    return true;
  });
  if (!created) return { ok: false, error: "Este barbero ya activó su cuenta: no hace falta un link nuevo." };

  revalidatePath(BARBERS_PATH);
  return {
    ok: true,
    message: "Generamos un link nuevo. Los anteriores ya no sirven.",
    invitePath: invitationPath(invite.token),
    barberName: user.name,
  };
}

export async function updateBarber(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = updateBarberSchema.safeParse({
    userId: text(formData, "userId") ?? "",
    name: text(formData, "name") ?? "",
    payoutScheme: text(formData, "payoutScheme"),
    payoutValue: text(formData, "payoutValue"),
  });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error) };

  const session = await ownerSession();
  if (!session) return { ok: false, error: FORBIDDEN };

  // El userId viene del cliente: el `where` incluye el barbershopId de la sesión, así que
  // un id de otra barbería no matchea y no se toca nada.
  const { count } = await db.user.updateMany({
    where: { id: parsed.data.userId, barbershopId: session.barbershopId },
    data: {
      name: parsed.data.name,
      payoutScheme: parsed.data.payoutScheme,
      payoutValue: new Prisma.Decimal(parsed.data.payoutValue),
    },
  });
  if (count !== 1) return { ok: false, error: NOT_FOUND };

  revalidatePath(BARBERS_PATH);
  revalidatePath(`${BARBERS_PATH}/${parsed.data.userId}`);
  return { ok: true, message: "Cambios guardados." };
}
