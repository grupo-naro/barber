import { jwtVerify, SignJWT } from "jose";
import { getSessionSecret } from "@/lib/session";

// JWT de la sesión de ADMIN DE LA PLATAFORMA. Puro (sin DB ni `next/headers`): lo importa `src/proxy.ts`.
// Usa el mismo `SESSION_SECRET` que la sesión de barbería, pero con audience `platform-admin` y otra cookie:
// `verifyAdminSession` exige ese audience y `verifySession` rechaza cualquier token con audience, así que un
// token no sirve en el otro verificador. La autorización real (re-leer el admin en la DB) está en `admin-auth.ts`.

export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 horas
export const ADMIN_AUDIENCE = "platform-admin";

export type AdminSessionPayload = {
  adminId: string;
  /** Vencimiento en milisegundos epoch. */
  expiresAt: number;
};

const ALGORITHM = "HS256";

export async function signAdminSession(
  payload: { adminId: string; expiresAt?: number },
  secret: Uint8Array = getSessionSecret(),
): Promise<string> {
  const expiresAt = payload.expiresAt ?? Date.now() + ADMIN_SESSION_DURATION_MS;
  return new SignJWT({ adminId: payload.adminId, expiresAt })
    .setProtectedHeader({ alg: ALGORITHM })
    .setAudience(ADMIN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(secret);
}

/**
 * Payload si el token es de admin (audience `platform-admin`), vigente y bien firmado; si no, `null`.
 * Nunca lanza por el token (sí si falta `SESSION_SECRET`, igual que `verifySession`).
 */
export async function verifyAdminSession(
  token: string | undefined | null,
  secret: Uint8Array = getSessionSecret(),
): Promise<AdminSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALGORITHM], audience: ADMIN_AUDIENCE });
    const { adminId, expiresAt } = payload as Record<string, unknown>;
    if (typeof adminId !== "string" || typeof expiresAt !== "number" || expiresAt <= Date.now()) return null;
    return { adminId, expiresAt };
  } catch {
    return null;
  }
}

export function adminSessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  };
}
