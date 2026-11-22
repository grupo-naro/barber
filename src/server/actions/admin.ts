"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createAdminSession, deleteAdminSession, getAdminSession } from "@/lib/admin-auth";
import { firstFieldErrors, type ActionResult } from "@/lib/barbershop-settings";
import { generateInvitationToken, hashInvitationToken, invitationExpiresAt, invitationPath } from "@/lib/invitations";
import { verifyPassword } from "@/lib/password";
import {
  EMAIL_UNAVAILABLE,
  SLUG_UNAVAILABLE,
  adminLoginSchema,
  barbershopRefSchema,
  createBarbershopSchema,
  defaultOpeningHours,
  planExpiresAtFromDate,
  setStatusSchema,
  updateBarbershopSchema,
} from "@/lib/platform-admin";
import { DEFAULT_TIMEZONE } from "@/lib/time";
import { barbershopBrandingTag } from "@/app/[slug]/data";

// Server Actions del panel de la PLATAFORMA. Orden fijo en cada una: Zod `safeParse` → `getAdminSession()`
// (sin sesión de admin no se toca nada) → query. La sesión de barbería no sirve acá (otra cookie y audience).

const UNAUTHORIZED = "Tu sesión de administrador venció. Volvé a ingresar.";
const INVALID = "Revisá los campos marcados.";
const NOT_FOUND = "No encontramos esa barbería.";
const GENERIC_LOGIN_ERROR = "Email o contraseña incorrectos";

// Hash con el formato real para gastar el mismo tiempo cuando el email no existe.
const DUMMY_HASH = "scrypt$00000000000000000000000000000000$" + "0".repeat(128);

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

/** Campo de la restricción única violada (`slug` / `email`), si se puede leer del error de Prisma. */
function uniqueViolation(error: unknown): "slug" | "email" | "unknown" | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const meta = JSON.stringify(error.meta ?? {});
  if (meta.includes("slug")) return "slug";
  if (meta.includes("email")) return "email";
  return "unknown";
}

function uniqueErrorResult(field: "slug" | "email" | "unknown") {
  const fieldErrors: Record<string, string> =
    field === "slug"
      ? { slug: SLUG_UNAVAILABLE }
      : field === "email"
        ? { ownerEmail: EMAIL_UNAVAILABLE }
        : { slug: SLUG_UNAVAILABLE, ownerEmail: EMAIL_UNAVAILABLE };
  return { ok: false as const, error: Object.values(fieldErrors).join(" "), fieldErrors };
}

async function newInvitation(now: Date) {
  const token = generateInvitationToken();
  return { token, tokenHash: await hashInvitationToken(token), expiresAt: invitationExpiresAt(now) };
}

// ---------------------------------------------------------------------------------------------------------------
// Login / logout

export type AdminLoginState = { error?: string; email?: string } | undefined;

export async function adminLogin(_prev: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  const email = text(formData, "email") ?? "";
  const parsed = adminLoginSchema.safeParse({ email, password: text(formData, "password") });
  if (!parsed.success) return { error: GENERIC_LOGIN_ERROR, email };

  const admin = await db.platformAdmin.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });
  const ok = await verifyPassword(parsed.data.password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !ok) return { error: GENERIC_LOGIN_ERROR, email };

  await db.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await createAdminSession(admin.id);
  redirect("/admin");
}

export async function adminLogout() {
  await deleteAdminSession();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------------------------------------------
// Alta de barbería

/** El link (`/invitacion/<token>`) viaja una sola vez en esta respuesta: en la DB solo queda el hash. */
export type AccessLinkResult =
  | { ok: true; message: string; invitePath: string; ownerName: string; barbershopName: string; barbershopId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function createBarbershop(
  _prev: AccessLinkResult | undefined,
  formData: FormData,
): Promise<AccessLinkResult> {
  const parsed = createBarbershopSchema.safeParse({
    name: text(formData, "name") ?? "",
    slug: text(formData, "slug") ?? "",
    ownerName: text(formData, "ownerName") ?? "",
    ownerEmail: text(formData, "ownerEmail") ?? "",
  });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error) };

  if (!(await getAdminSession())) return { ok: false, error: UNAUTHORIZED };
  const { name, slug, ownerName, ownerEmail } = parsed.data;

  // Chequeo previo (mensajes genéricos); la carrera la cubre el P2002 de la transacción.
  const [slugTaken, emailTaken] = await Promise.all([
    db.barbershop.findUnique({ where: { slug }, select: { id: true } }),
    db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
  ]);
  if (slugTaken || emailTaken) {
    return uniqueErrorResult(slugTaken && emailTaken ? "unknown" : slugTaken ? "slug" : "email");
  }

  const now = new Date();
  const invite = await newInvitation(now);
  let barbershopId: string;
  try {
    barbershopId = await db.$transaction(async (tx) => {
      const shop = await tx.barbershop.create({
        data: {
          name,
          slug,
          timezone: DEFAULT_TIMEZONE,
          status: "ACTIVE",
          plan: "FREE",
          // Las barberías nuevas nacen con cobro: quedan AWAITING_FIRST_PAYMENT hasta el primer pago.
          billingEnabled: true,
          openingHours: { create: defaultOpeningHours() },
        },
        select: { id: true },
      });
      const owner = await tx.user.create({
        data: { barbershopId: shop.id, name: ownerName, email: ownerEmail, role: "OWNER", passwordHash: null },
        select: { id: true },
      });
      await tx.invitation.create({
        data: {
          userId: owner.id,
          barbershopId: shop.id,
          kind: "INVITE",
          tokenHash: invite.tokenHash,
          expiresAt: invite.expiresAt,
        },
      });
      return shop.id;
    });
  } catch (error) {
    const field = uniqueViolation(error);
    if (field) return uniqueErrorResult(field);
    throw error;
  }

  // Por si la landing tenía cacheado un "no existe" para este slug.
  updateTag(barbershopBrandingTag(slug));
  revalidatePath("/admin");
  return {
    ok: true,
    message: `Listo, creamos ${name}. Mandale el link a ${ownerName} para que elija su contraseña.`,
    invitePath: invitationPath(invite.token),
    ownerName,
    barbershopName: name,
    barbershopId,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Edición

async function findOwner(barbershopId: string) {
  return db.user.findFirst({
    where: { barbershopId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, active: true },
  });
}

export async function updateBarbershop(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = updateBarbershopSchema.safeParse({
    id: text(formData, "id") ?? "",
    name: text(formData, "name") ?? "",
    slug: text(formData, "slug") ?? "",
    ownerEmail: text(formData, "ownerEmail") ?? "",
    plan: text(formData, "plan"),
    planExpiresAt: text(formData, "planExpiresAt"),
  });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error) };

  if (!(await getAdminSession())) return { ok: false, error: UNAUTHORIZED };
  const input = parsed.data;

  const shop = await db.barbershop.findUnique({
    where: { id: input.id },
    select: { id: true, slug: true, timezone: true, billingEnabled: true },
  });
  if (!shop) return { ok: false, error: NOT_FOUND };
  const owner = await findOwner(shop.id);
  if (!owner) return { ok: false, error: "Esta barbería no tiene dueño cargado." };

  const slugChanged = input.slug !== shop.slug;
  const emailChanged = input.ownerEmail !== owner.email;
  const [slugTaken, emailTaken] = await Promise.all([
    slugChanged ? db.barbershop.findUnique({ where: { slug: input.slug }, select: { id: true } }) : null,
    emailChanged ? db.user.findUnique({ where: { email: input.ownerEmail }, select: { id: true } }) : null,
  ]);
  if (slugTaken || emailTaken) {
    return uniqueErrorResult(slugTaken && emailTaken ? "unknown" : slugTaken ? "slug" : "email");
  }

  try {
    await db.$transaction([
      db.barbershop.update({
        where: { id: shop.id },
        data: {
          name: input.name,
          slug: input.slug,
          plan: input.plan,
          // Con el cobro activado, "pagado hasta" solo lo mueve un pago (`recordPayment`): se ignora lo que venga.
          ...(shop.billingEnabled
            ? {}
            : { planExpiresAt: input.planExpiresAt ? planExpiresAtFromDate(input.planExpiresAt, shop.timezone) : null }),
        },
      }),
      db.user.updateMany({ where: { id: owner.id, barbershopId: shop.id }, data: { email: input.ownerEmail } }),
    ]);
  } catch (error) {
    const field = uniqueViolation(error);
    if (field) return uniqueErrorResult(field);
    throw error;
  }

  // Landing cacheada: la del slug viejo (deja de existir) y la del nuevo.
  updateTag(barbershopBrandingTag(shop.slug));
  if (slugChanged) updateTag(barbershopBrandingTag(input.slug));
  revalidatePath("/admin");
  return { ok: true, message: "Cambios guardados." };
}

// ---------------------------------------------------------------------------------------------------------------
// Suspender / reactivar

export async function setBarbershopStatus(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = setStatusSchema.safeParse({ id: text(formData, "id") ?? "", status: text(formData, "status") });
  if (!parsed.success) return { ok: false, error: INVALID };

  if (!(await getAdminSession())) return { ok: false, error: UNAUTHORIZED };

  const shop = await db.barbershop.findUnique({ where: { id: parsed.data.id }, select: { id: true, slug: true } });
  if (!shop) return { ok: false, error: NOT_FOUND };

  // Solo cambia el estado: no se borra nada. Las sesiones de la barbería se cortan en `getSession`.
  await db.barbershop.update({ where: { id: shop.id }, data: { status: parsed.data.status } });

  updateTag(barbershopBrandingTag(shop.slug));
  revalidatePath("/admin");
  return {
    ok: true,
    message: parsed.data.status === "SUSPENDED" ? "Barbería suspendida." : "Barbería reactivada.",
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Nuevo link de acceso para el dueño (RESET)

export async function createOwnerAccessLink(
  _prev: AccessLinkResult | undefined,
  formData: FormData,
): Promise<AccessLinkResult> {
  const parsed = barbershopRefSchema.safeParse({ id: text(formData, "id") ?? "" });
  if (!parsed.success) return { ok: false, error: NOT_FOUND };

  if (!(await getAdminSession())) return { ok: false, error: UNAUTHORIZED };

  const shop = await db.barbershop.findUnique({ where: { id: parsed.data.id }, select: { id: true, name: true } });
  if (!shop) return { ok: false, error: NOT_FOUND };
  const owner = await findOwner(shop.id);
  if (!owner) return { ok: false, error: "Esta barbería no tiene dueño cargado." };
  if (!owner.active) return { ok: false, error: "El dueño está inactivo: no se puede generar un link." };

  const now = new Date();
  const invite = await newInvitation(now);
  await db.$transaction([
    // Los links anteriores sin usar (INVITE o RESET) dejan de servir.
    db.invitation.updateMany({ where: { userId: owner.id, usedAt: null }, data: { usedAt: now } }),
    db.invitation.create({
      data: {
        userId: owner.id,
        barbershopId: shop.id,
        kind: "RESET",
        tokenHash: invite.tokenHash,
        expiresAt: invite.expiresAt,
      },
    }),
  ]);

  return {
    ok: true,
    message: "Generamos un link nuevo. Los anteriores ya no sirven.",
    invitePath: invitationPath(invite.token),
    ownerName: owner.name,
    barbershopName: shop.name,
    barbershopId: shop.id,
  };
}
