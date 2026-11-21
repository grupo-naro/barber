// Lógica pura de las invitaciones de barberos. Sin Prisma ni Next: la usan las actions, las queries y los tests.
// Usa Web Crypto (`globalThis.crypto`, disponible en Node y en el navegador) y no `node:crypto`: el armado del link
// de WhatsApp también se importa desde un Client Component y así no se arrastra un polyfill de crypto al bundle.

/** Bytes de entropía del token (256 bits). */
export const INVITATION_TOKEN_BYTES = 32;
/** Vigencia del link: 48 horas desde que se genera. */
export const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
/** Largo máximo aceptado para un token que llega en la URL (el real tiene 43 caracteres). */
export const INVITATION_TOKEN_MAX_LENGTH = 128;

export const INVALID_INVITATION_MESSAGE =
  "Este link de invitación no es válido o venció. Pedile uno nuevo a tu barbería.";

/** Token crudo para el link (base64url, sin padding). Nunca se guarda en la DB. */
export function generateInvitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITATION_TOKEN_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Lo único que se guarda: sha256 hex del token. */
export async function hashInvitationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function invitationExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_MS);
}

/** Usable si no se usó y todavía no venció. En el borde exacto (`now === expiresAt`) ya está vencida. */
export function isInvitationUsable(invitation: { expiresAt: Date; usedAt: Date | null }, now: Date): boolean {
  return invitation.usedAt === null && now.getTime() < invitation.expiresAt.getTime();
}

/** Forma plausible de un token antes de ir a la DB (base64url, largo acotado). */
export function isPlausibleInvitationToken(token: string): boolean {
  return token.length > 0 && token.length <= INVITATION_TOKEN_MAX_LENGTH && /^[A-Za-z0-9_-]+$/.test(token);
}

export function invitationPath(token: string): string {
  return `/invitacion/${token}`;
}

/** Texto del mensaje de invitación. */
export function invitationMessage(barbershopName: string, url: string): string {
  return `¡Hola! Te invitaron a sumarte a ${barbershopName} en Barber. Entrá a este link para elegir tu contraseña (vence en 48 horas): ${url}`;
}

/** Link de WhatsApp sin teléfono: el que lo abre elige a quién mandarlo. */
export function whatsappInviteUrl(barbershopName: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(invitationMessage(barbershopName, url))}`;
}
