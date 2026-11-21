// Lecturas de la gestión de barberos e invitaciones. El `barbershopId` lo pasa el llamador y SIEMPRE
// sale de la sesión del servidor. Nunca se devuelve `passwordHash` ni `tokenHash`: solo el estado derivado.
import "server-only";
import { db } from "@/lib/db";
import { barberAccessStatus } from "@/lib/barbers";
import type { PayoutSchemeValue } from "@/lib/barbershop-settings";
import { hashInvitationToken, isInvitationUsable, isPlausibleInvitationToken } from "@/lib/invitations";

export type BarberListItem = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "BARBER";
  active: boolean;
  status: "ACTIVE" | "PENDING";
  payoutScheme: PayoutSchemeValue;
  /** Decimal como string ("120000.00"): nunca float. */
  payoutValue: string;
};

const barberSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  passwordHash: true,
  payoutScheme: true,
  payoutValue: true,
} as const;

function toItem(user: {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "BARBER";
  active: boolean;
  passwordHash: string | null;
  payoutScheme: PayoutSchemeValue;
  payoutValue: { toFixed(digits: number): string };
}): BarberListItem {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    status: barberAccessStatus(user),
    payoutScheme: user.payoutScheme,
    payoutValue: user.payoutValue.toFixed(2),
  };
}

/** Usuarios de la barbería: dueños primero, después por nombre. */
export async function listBarbers(barbershopId: string): Promise<BarberListItem[]> {
  const users = await db.user.findMany({
    where: { barbershopId },
    orderBy: [{ role: "asc" }, { active: "desc" }, { name: "asc" }],
    select: barberSelect,
  });
  return users.map(toItem);
}

/** Un usuario por `id` **y** `barbershopId` (un id de otra barbería → `null`). */
export async function getBarber(barbershopId: string, id: string): Promise<BarberListItem | null> {
  if (id.length > 100) return null;
  const user = await db.user.findFirst({ where: { id, barbershopId }, select: barberSelect });
  return user ? toItem(user) : null;
}

export type InvitationPreview = { barbershopName: string; userName: string };

/**
 * Invitación usable para el token crudo de la URL, buscada por su hash único. `null` si el token no existe,
 * venció, ya se usó o el usuario ya tiene contraseña: el llamador muestra siempre el mismo mensaje.
 */
export async function getUsableInvitation(token: string, now: Date = new Date()): Promise<InvitationPreview | null> {
  if (!isPlausibleInvitationToken(token)) return null;
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: await hashInvitationToken(token) },
    select: {
      barbershopId: true,
      expiresAt: true,
      usedAt: true,
      barbershop: { select: { name: true } },
      user: { select: { name: true, barbershopId: true, passwordHash: true, active: true } },
    },
  });
  if (
    !invitation ||
    !isInvitationUsable(invitation, now) ||
    invitation.user.passwordHash !== null ||
    !invitation.user.active ||
    invitation.user.barbershopId !== invitation.barbershopId
  ) {
    return null;
  }
  return { barbershopName: invitation.barbershop.name, userName: invitation.user.name };
}
