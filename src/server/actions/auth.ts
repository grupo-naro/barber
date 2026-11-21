"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { safeNextPath } from "@/proxy";

export type LoginState = { error?: string; email?: string } | undefined;

const GENERIC_ERROR = "Email o contraseña incorrectos";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

// Hash con el formato real para gastar el mismo tiempo cuando el usuario no existe.
const DUMMY_HASH =
  "scrypt$00000000000000000000000000000000$" + "0".repeat(128);

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";
  if (!parsed.success) return { error: GENERIC_ERROR, email };

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, barbershopId: true, role: true, active: true, passwordHash: true },
  });
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !user.passwordHash || !ok) return { error: GENERIC_ERROR, email };

  await createSession(user);
  // TODO(job posterior): rate limit de login por IP + email (fuera de alcance de 001).
  redirect(safeNextPath(parsed.data.next));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
