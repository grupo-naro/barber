import { jwtVerify, SignJWT } from "jose";

// Solo firma y verifica el JWT de sesión: sin DB, sin `next/headers`, importable desde `src/proxy.ts`.
// La autorización real (re-leer el usuario en la DB) está en `src/lib/auth.ts`.

export const SESSION_COOKIE = "session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export type SessionRole = "OWNER" | "BARBER";

export type SessionPayload = {
  userId: string;
  barbershopId: string;
  role: SessionRole;
  /** Vencimiento en milisegundos epoch. */
  expiresAt: number;
  /** `iat` del JWT en segundos epoch (`null` si el token no lo trae). Se compara con `User.passwordChangedAt`. */
  issuedAt: number | null;
};

const ALGORITHM = "HS256";

/** Lee `SESSION_SECRET` en runtime. Falla con un error claro si falta o es demasiado corto. */
export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Falta SESSION_SECRET (mínimo 32 caracteres). Generalo con `openssl rand -base64 32` y agregalo a tu .env.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(
  payload: Omit<SessionPayload, "expiresAt" | "issuedAt"> & { expiresAt?: number },
  secret: Uint8Array = getSessionSecret(),
): Promise<string> {
  const expiresAt = payload.expiresAt ?? Date.now() + SESSION_DURATION_MS;
  return new SignJWT({
    userId: payload.userId,
    barbershopId: payload.barbershopId,
    role: payload.role,
    expiresAt,
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(secret);
}

/**
 * Devuelve el payload si el token es válido, está vigente y bien formado; si no, `null`. Nunca lanza por el token.
 * Sí lanza (a propósito, AC-7) si falta `SESSION_SECRET`: el secreto por defecto se evalúa fuera del `try`,
 * así que en el proxy las rutas privadas responden 500 con un error claro en vez de dejar pasar.
 */
export async function verifySession(
  token: string | undefined | null,
  secret: Uint8Array = getSessionSecret(),
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALGORITHM] });
    // Los tokens de barbería nunca llevan `aud`: cualquier token con audience (p. ej. el de admin de la
    // plataforma, `platform-admin`, firmado con el mismo secreto) se rechaza acá.
    if (payload.aud !== undefined) return null;
    const { userId, barbershopId, role, expiresAt } = payload as Record<string, unknown>;
    if (
      typeof userId !== "string" ||
      typeof barbershopId !== "string" ||
      (role !== "OWNER" && role !== "BARBER") ||
      typeof expiresAt !== "number" ||
      expiresAt <= Date.now()
    ) {
      return null;
    }
    const issuedAt = typeof payload.iat === "number" && Number.isFinite(payload.iat) ? payload.iat : null;
    return { userId, barbershopId, role, expiresAt, issuedAt };
  } catch {
    return null;
  }
}

/**
 * Revocación por cambio de contraseña (pura). Compara a precisión de SEGUNDO, porque `iat` está en segundos:
 * revocada si `issuedAtSec < floor(passwordChangedAt / 1000)`. Un token emitido en el mismo segundo del cambio
 * (o después) sigue valiendo, así la cookie re-emitida al cambiar la contraseña no se auto-revoca.
 * `passwordChangedAt` null → nunca revocada. Sin `iat` y con cambio registrado → revocada.
 */
export function isSessionRevoked(issuedAtSec: number | null | undefined, passwordChangedAt: Date | null): boolean {
  if (passwordChangedAt === null) return false;
  if (typeof issuedAtSec !== "number" || !Number.isFinite(issuedAtSec)) return true;
  return issuedAtSec < Math.floor(passwordChangedAt.getTime() / 1000);
}

export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  };
}
