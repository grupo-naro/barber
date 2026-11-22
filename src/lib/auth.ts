import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { billingState, type BillingState } from "@/lib/billing";
import { db } from "@/lib/db";
import {
  isSessionRevoked,
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
    /** "Pagado hasta" cuando `billingEnabled`; si no, el vencimiento informativo del plan. */
    planExpiresAt: Date | null;
    billingEnabled: boolean;
    mpStatus: string | null;
    mpInitPoint: string | null;
    payerEmail: string | null;
    /** Estado de cobro calculado en cada request (`billingState(..., new Date())`). No invalida la sesión. */
    billingState: BillingState;
  };
};

// Destinos de `requireSession` cuando el JWT es válido pero la DB rechaza la sesión. Son rutas CONSTANTES
// (nunca se arman con input del usuario) y el proxy no las rebota a `/dashboard` (ver `isLoginNotice`).
/** La barbería de la sesión está suspendida. */
export const SUSPENDED_LOGIN_PATH = "/login?suspended=1";
/** El usuario no existe, está inactivo o ya no pertenece a la barbería del token. */
export const INACTIVE_LOGIN_PATH = "/login?inactive=1";
/** La sesión es anterior al último cambio de contraseña. */
export const EXPIRED_LOGIN_PATH = "/login?expired=1";

/** Avisos de `/login` (los muestra `src/app/(auth)/login/page.tsx`). */
export const INACTIVE_MESSAGE = "Tu acceso fue desactivado. Hablá con el dueño de la barbería.";
export const EXPIRED_MESSAGE = "Tu sesión se cerró porque cambió la contraseña. Ingresá de nuevo.";

/** Motivo por el que se rechazó una sesión con JWT válido (`null` = sin token, token inválido o sesión OK). */
export type SessionRejection = "suspended" | "inactive" | "expired" | null;

type SessionLookup = { session: Session | null; reason: SessionRejection };

const REJECTION_PATH: Record<Exclude<SessionRejection, null>, string> = {
  suspended: SUSPENDED_LOGIN_PATH,
  inactive: INACTIVE_LOGIN_PATH,
  expired: EXPIRED_LOGIN_PATH,
};

/** Lectura memoizada por request: la sesión o el motivo del rechazo. */
const lookupSession = cache(async (): Promise<SessionLookup> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifySession(token);
  if (!payload) return { session: null, reason: null };

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      barbershopId: true,
      passwordChangedAt: true,
      barbershop: {
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          status: true,
          plan: true,
          planExpiresAt: true,
          billingEnabled: true,
          mpStatus: true,
          mpInitPoint: true,
          payerEmail: true,
        },
      },
    },
  });
  // Usuario borrado, desactivado o de otro tenant: el JWT sigue siendo válido para el proxy, así que se manda a
  // `/login?inactive=1` (que el proxy deja pasar) en vez de `/login` (que rebotaría a `/dashboard` → loop).
  if (!user || !user.active || user.barbershopId !== payload.barbershopId) return { session: null, reason: "inactive" };
  // Barbería suspendida: las sesiones ya emitidas dejan de servir (vuelven a servir al reactivarla).
  if (user.barbershop.status !== "ACTIVE") return { session: null, reason: "suspended" };
  // Cambio de contraseña posterior a la emisión del token (a precisión de segundo): se cierran los otros dispositivos.
  if (isSessionRevoked(payload.issuedAt, user.passwordChangedAt)) return { session: null, reason: "expired" };

  const session: Session = {
    userId: user.id,
    barbershopId: user.barbershopId,
    // El rol vigente es el de la DB (si cambió desde el login, manda la DB).
    role: user.role,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    // El cobro se mira después de `SUSPENDED` y no rechaza la sesión: con el panel bloqueado el usuario entra
    // y ve la pantalla de pago (el corte lo hacen el layout del panel y `requirePanelAccess` en las actions).
    barbershop: {
      ...user.barbershop,
      billingState: billingState(
        { billingEnabled: user.barbershop.billingEnabled, paidUntil: user.barbershop.planExpiresAt },
        new Date(),
      ),
    },
  };
  return { session, reason: null };
});

/**
 * Lee la cookie, verifica el JWT y re-lee el usuario en la DB. Devuelve `null` si el token es inválido,
 * el usuario no existe, está inactivo, ya no pertenece al `barbershopId` del token, su barbería está
 * suspendida o la sesión es anterior al último cambio de contraseña. Memoizado por request.
 * Llamala dentro de un `<Suspense>` (lee cookies). La cookie rechazada se ignora (no se borra al renderizar).
 */
export async function getSession(): Promise<Session | null> {
  return (await lookupSession()).session;
}

/**
 * Sesión obligatoria. Sin token o con token inválido → `/login`; con JWT válido pero rechazado por la DB →
 * la ruta de aviso constante del motivo (`?suspended=1`, `?inactive=1`, `?expired=1`), que el proxy no rebota.
 */
export async function requireSession(): Promise<Session> {
  const { session, reason } = await lookupSession();
  if (reason) redirect(REJECTION_PATH[reason]);
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
