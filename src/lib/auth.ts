import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  sessionCookieOptions,
  signSession,
  verifySession,
  type SessionRole,
} from "@/lib/session";

// Data Access Layer de autenticación. Es la ÚNICA fuente de verdad del `barbershopId`:
// sale del JWT verificado y se re-confirma contra la DB en cada request.

export type Session = {
  userId: string;
  barbershopId: string;
  role: SessionRole;
  user: { id: string; name: string; email: string; role: SessionRole };
  barbershop: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    status: "ACTIVE" | "SUSPENDED";
    plan: "FREE" | "BASIC" | "PRO";
    planExpiresAt: Date | null;
  };
};

/** Destino de `requireSession` cuando la barbería está suspendida (el proxy no lo rebota a `/dashboard`). */
export const SUSPENDED_LOGIN_PATH = "/login?suspended=1";

type SessionLookup = { session: Session | null; suspended: boolean };

/** Lectura memoizada por request: la sesión y si se rechazó por barbería suspendida. */
const lookupSession = cache(async (): Promise<SessionLookup> => {
  const none = { session: null, suspended: false };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifySession(token);
  if (!payload) return none;

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      barbershopId: true,
      barbershop: {
        select: { id: true, name: true, slug: true, timezone: true, status: true, plan: true, planExpiresAt: true },
      },
    },
  });
  if (!user || !user.active || user.barbershopId !== payload.barbershopId) return none;
  // Barbería suspendida: las sesiones ya emitidas dejan de servir (vuelven a servir al reactivarla).
  if (user.barbershop.status !== "ACTIVE") return { session: null, suspended: true };

  const session: Session = {
    userId: user.id,
    barbershopId: user.barbershopId,
    // El rol vigente es el de la DB (si cambió desde el login, manda la DB).
    role: user.role,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    barbershop: user.barbershop,
  };
  return { session, suspended: false };
});

/**
 * Lee la cookie, verifica el JWT y re-lee el usuario en la DB. Devuelve `null` si el token es inválido,
 * el usuario no existe, está inactivo, ya no pertenece al `barbershopId` del token o su barbería está
 * suspendida. Memoizado por request. Llamala dentro de un `<Suspense>` (lee cookies).
 */
export async function getSession(): Promise<Session | null> {
  return (await lookupSession()).session;
}

/** Sesión obligatoria: sin sesión válida redirige a `/login` (o a `/login?suspended=1` si está suspendida). */
export async function requireSession(): Promise<Session> {
  const { session, suspended } = await lookupSession();
  if (suspended) redirect(SUSPENDED_LOGIN_PATH);
  if (!session) redirect("/login");
  return session;
}

/** Exige un rol. Sin sesión → `/login`; con otro rol → `/dashboard`. */
export async function requireRole(role: SessionRole): Promise<Session> {
  const session = await requireSession();
  if (session.role !== role) redirect("/dashboard");
  return session;
}

/** Crea la cookie de sesión (usar solo desde Server Actions / Route Handlers). */
export async function createSession(user: { id: string; barbershopId: string; role: SessionRole }) {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const token = await signSession({
    userId: user.id,
    barbershopId: user.barbershopId,
    role: user.role,
    expiresAt,
  });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
