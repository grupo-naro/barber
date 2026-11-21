import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_DURATION_MS,
  adminSessionCookieOptions,
  signAdminSession,
  verifyAdminSession,
} from "@/lib/admin-session";

// Data Access Layer del panel de la PLATAFORMA. Totalmente separado del de barberías (`src/lib/auth.ts`):
// otra cookie, otro audience y otra tabla. Cada página y action de `/admin` pasa por acá.

export type AdminSession = {
  adminId: string;
  admin: { id: string; email: string; name: string };
};

/**
 * Lee la cookie `admin_session`, verifica el JWT (audience `platform-admin`) y re-lee el `PlatformAdmin` en la
 * DB. `null` si falta, es inválido o el admin ya no existe. Memoizado por request; llamala dentro de `<Suspense>`.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const payload = await verifyAdminSession(token);
  if (!payload) return null;

  const admin = await db.platformAdmin.findUnique({
    where: { id: payload.adminId },
    select: { id: true, email: true, name: true },
  });
  if (!admin) return null;
  return { adminId: admin.id, admin };
});

/** Sesión de admin obligatoria: sin sesión válida redirige a `/admin/login`. */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** Crea la cookie de admin (solo desde Server Actions). */
export async function createAdminSession(adminId: string) {
  const expiresAt = Date.now() + ADMIN_SESSION_DURATION_MS;
  const token = await signAdminSession({ adminId, expiresAt });
  (await cookies()).set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions(expiresAt));
}

export async function deleteAdminSession() {
  (await cookies()).delete(ADMIN_SESSION_COOKIE);
}
