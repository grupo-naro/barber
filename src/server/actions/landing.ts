"use server";

import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { getSession, type Session } from "@/lib/auth";
import { firstFieldErrors, type ActionResult } from "@/lib/barbershop-settings";
import { brandColorsSchema } from "@/lib/brand-colors";
import { galleryAltSchema, galleryIdSchema, galleryMoveSchema, socialLinksSchema } from "@/lib/landing";
import { MAX_GALLERY_IMAGES, MAX_UPLOAD_BYTES, detectImageType, mediaKeyFromUrl, mediaUrl, type ImageType } from "@/lib/media";
import { deleteImageQuietly, isKeyOfShop, saveImage } from "@/server/media-storage";
import { barbershopBrandingTag } from "@/app/[slug]/data";

// Mutaciones del contenido de la landing pública (logo, portada, galería, redes, colores).
// Orden fijo: validar la entrada (archivo o Zod) → sesión y rol OWNER → query/disco con el
// `barbershopId` de la SESIÓN (nunca de un campo del formulario). Sin sesión de OWNER no se
// escribe nada en disco.

const SETTINGS_PATH = "/dashboard/settings";
const FORBIDDEN: ActionResult = { ok: false, error: "No tenés permiso para cambiar la configuración." };
const NOT_FOUND: ActionResult = { ok: false, error: "No encontramos esa foto." };
const GALLERY_FULL: ActionResult = { ok: false, error: `Llegaste al máximo de ${MAX_GALLERY_IMAGES} fotos.` };
const INVALID = "Revisá los campos marcados.";

/** Sesión de un OWNER activo o `null`. */
async function ownerSession(): Promise<Session | null> {
  const session = await getSession();
  return session && session.role === "OWNER" ? session : null;
}

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function invalidate(session: Session) {
  // Read-your-own-writes: la próxima carga de `/<slug>` ya ve el contenido nuevo.
  updateTag(barbershopBrandingTag(session.barbershop.slug));
  revalidatePath(SETTINGS_PATH);
}

type ValidImage = { ok: true; bytes: Uint8Array; type: ImageType };

/** Valida el archivo `file` del form: existe, pesa ≤ 3MB y sus magic bytes son JPG/PNG/WebP. */
async function readImageField(formData: FormData): Promise<ValidImage | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "Elegí una imagen." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "La imagen pesa más de 3 MB. Probá con una más chica." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "El archivo tiene que ser una imagen JPG, PNG o WebP." };
  return { ok: true, bytes, type };
}

/** Bloquea la fila de la barbería dentro de la transacción: serializa las mutaciones de la galería. */
async function lockShop(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], barbershopId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Barbershop" WHERE "id" = ${barbershopId} FOR UPDATE`;
}

class GalleryFullError extends Error {}

// ---------------------------------------------------------------------------
// Galería
// ---------------------------------------------------------------------------

export async function uploadGalleryImage(formData: FormData): Promise<ActionResult> {
  const image = await readImageField(formData);
  if (!image.ok) return image;

  const session = await ownerSession();
  if (!session) return FORBIDDEN;
  const { barbershopId } = session;

  // Chequeo previo barato para no escribir en disco si ya está llena; el definitivo va en la transacción.
  if ((await db.galleryImage.count({ where: { barbershopId } })) >= MAX_GALLERY_IMAGES) return GALLERY_FULL;

  const key = await saveImage(barbershopId, image.bytes, image.type);
  try {
    await db.$transaction(async (tx) => {
      await lockShop(tx, barbershopId);
      const count = await tx.galleryImage.count({ where: { barbershopId } });
      if (count >= MAX_GALLERY_IMAGES) throw new GalleryFullError();
      const { _max } = await tx.galleryImage.aggregate({ where: { barbershopId }, _max: { sortOrder: true } });
      await tx.galleryImage.create({
        data: { barbershopId, storageKey: key, sortOrder: (_max.sortOrder ?? -1) + 1 },
      });
    });
  } catch (error) {
    await deleteImageQuietly(key, barbershopId);
    if (error instanceof GalleryFullError) return GALLERY_FULL;
    throw error;
  }

  invalidate(session);
  return { ok: true, message: "Foto subida." };
}

export async function updateGalleryImageAlt(formData: FormData): Promise<ActionResult> {
  const parsed = galleryAltSchema.safeParse({ id: text(formData, "id") ?? "", alt: text(formData, "alt") });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error) };

  const session = await ownerSession();
  if (!session) return FORBIDDEN;

  const { count } = await db.galleryImage.updateMany({
    where: { id: parsed.data.id, barbershopId: session.barbershopId },
    data: { alt: parsed.data.alt },
  });
  if (count !== 1) return NOT_FOUND;

  invalidate(session);
  return { ok: true, message: "Descripción guardada." };
}

export async function moveGalleryImage(formData: FormData): Promise<ActionResult> {
  const parsed = galleryMoveSchema.safeParse({ id: text(formData, "id") ?? "", direction: text(formData, "direction") });
  if (!parsed.success) return { ok: false, error: "No se pudo mover la foto." };

  const session = await ownerSession();
  if (!session) return FORBIDDEN;
  const { barbershopId } = session;
  const { id, direction } = parsed.data;

  const found = await db.$transaction(async (tx) => {
    await lockShop(tx, barbershopId);
    const images = await tx.galleryImage.findMany({
      where: { barbershopId },
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const index = images.findIndex((img) => img.id === id);
    if (index === -1) return false;
    const neighbor = images[direction === "up" ? index - 1 : index + 1];
    if (!neighbor) return true; // ya está en el extremo: nada que hacer
    const current = images[index];

    if (current.sortOrder !== neighbor.sortOrder) {
      // Caso normal: intercambia el sortOrder con el vecino (ambos filtrados por barbería).
      await tx.galleryImage.updateMany({ where: { id: current.id, barbershopId }, data: { sortOrder: neighbor.sortOrder } });
      await tx.galleryImage.updateMany({ where: { id: neighbor.id, barbershopId }, data: { sortOrder: current.sortOrder } });
    } else {
      // Empate (no debería pasar): renumera toda la galería con el nuevo orden.
      const reordered = [...images];
      const target = direction === "up" ? index - 1 : index + 1;
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      for (const [i, img] of reordered.entries()) {
        if (img.sortOrder !== i) {
          await tx.galleryImage.updateMany({ where: { id: img.id, barbershopId }, data: { sortOrder: i } });
        }
      }
    }
    return true;
  });
  if (!found) return NOT_FOUND;

  invalidate(session);
  return { ok: true };
}

export async function deleteGalleryImage(formData: FormData): Promise<ActionResult> {
  const parsed = galleryIdSchema.safeParse({ id: text(formData, "id") ?? "" });
  if (!parsed.success) return NOT_FOUND;

  const session = await ownerSession();
  if (!session) return FORBIDDEN;
  const { barbershopId } = session;

  const image = await db.galleryImage.findFirst({
    where: { id: parsed.data.id, barbershopId },
    select: { id: true, storageKey: true },
  });
  if (!image) return NOT_FOUND;

  const { count } = await db.galleryImage.deleteMany({ where: { id: image.id, barbershopId } });
  if (count !== 1) return NOT_FOUND;
  // Primero la fila; si el archivo ya no existe, igual queda borrada.
  if (isKeyOfShop(image.storageKey, barbershopId)) await deleteImageQuietly(image.storageKey, barbershopId);

  invalidate(session);
  return { ok: true, message: "Foto borrada." };
}

// ---------------------------------------------------------------------------
// Portada y logo
// ---------------------------------------------------------------------------

export async function setCoverImage(formData: FormData): Promise<ActionResult> {
  const image = await readImageField(formData);
  if (!image.ok) return image;

  const session = await ownerSession();
  if (!session) return FORBIDDEN;
  const { barbershopId } = session;

  const key = await saveImage(barbershopId, image.bytes, image.type);
  let previous: string | null;
  try {
    previous = await db.$transaction(async (tx) => {
      await lockShop(tx, barbershopId);
      const shop = await tx.barbershop.findUnique({ where: { id: barbershopId }, select: { coverImageKey: true } });
      await tx.barbershop.update({ where: { id: barbershopId }, data: { coverImageKey: key } });
      return shop?.coverImageKey ?? null;
    });
  } catch (error) {
    await deleteImageQuietly(key, barbershopId);
    throw error;
  }
  if (previous && previous !== key) await deleteImageQuietly(previous, barbershopId);

  invalidate(session);
  return { ok: true, message: "Portada actualizada." };
}

export async function removeCoverImage(): Promise<ActionResult> {
  const session = await ownerSession();
  if (!session) return FORBIDDEN;
  const { barbershopId } = session;

  const previous = await db.$transaction(async (tx) => {
    await lockShop(tx, barbershopId);
    const shop = await tx.barbershop.findUnique({ where: { id: barbershopId }, select: { coverImageKey: true } });
    await tx.barbershop.update({ where: { id: barbershopId }, data: { coverImageKey: null } });
    return shop?.coverImageKey ?? null;
  });
  await deleteImageQuietly(previous, barbershopId);

  invalidate(session);
  return { ok: true, message: "Portada quitada." };
}

export async function setLogoImage(formData: FormData): Promise<ActionResult> {
  const image = await readImageField(formData);
  if (!image.ok) return image;

  const session = await ownerSession();
  if (!session) return FORBIDDEN;
  const { barbershopId } = session;

  const key = await saveImage(barbershopId, image.bytes, image.type);
  let previous: string | null;
  try {
    previous = await db.$transaction(async (tx) => {
      await lockShop(tx, barbershopId);
      const shop = await tx.barbershop.findUnique({ where: { id: barbershopId }, select: { logoUrl: true } });
      await tx.barbershop.update({ where: { id: barbershopId }, data: { logoUrl: mediaUrl(key) } });
      return shop?.logoUrl ?? null;
    });
  } catch (error) {
    await deleteImageQuietly(key, barbershopId);
    throw error;
  }
  // Solo se borra del disco si el logo anterior era un archivo `/media/` de ESTA barbería;
  // un `logoUrl` externo viejo solo se reemplaza.
  await deleteImageQuietly(mediaKeyFromUrl(previous, barbershopId), barbershopId);

  invalidate(session);
  return { ok: true, message: "Logo actualizado." };
}

export async function removeLogo(): Promise<ActionResult> {
  const session = await ownerSession();
  if (!session) return FORBIDDEN;
  const { barbershopId } = session;

  const previous = await db.$transaction(async (tx) => {
    await lockShop(tx, barbershopId);
    const shop = await tx.barbershop.findUnique({ where: { id: barbershopId }, select: { logoUrl: true } });
    await tx.barbershop.update({ where: { id: barbershopId }, data: { logoUrl: null } });
    return shop?.logoUrl ?? null;
  });
  await deleteImageQuietly(mediaKeyFromUrl(previous, barbershopId), barbershopId);

  invalidate(session);
  return { ok: true, message: "Logo quitado." };
}

// ---------------------------------------------------------------------------
// Redes
// ---------------------------------------------------------------------------

export async function updateSocialLinks(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const parsed = socialLinksSchema.safeParse({
    instagram: text(formData, "instagram"),
    googleMapsUrl: text(formData, "googleMapsUrl"),
  });
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error) };

  const session = await ownerSession();
  if (!session) return FORBIDDEN;

  await db.barbershop.update({ where: { id: session.barbershopId }, data: parsed.data });

  invalidate(session);
  const { instagram, googleMapsUrl } = parsed.data;
  return {
    ok: true,
    message: instagram ? `Redes guardadas. Instagram: @${instagram}.` : "Redes guardadas.",
    values: { instagram: instagram ? `@${instagram}` : "", googleMapsUrl: googleMapsUrl ?? "" },
  };
}

// ---------------------------------------------------------------------------
// Colores
// ---------------------------------------------------------------------------

/**
 * Guarda los colores de marca de la landing. Se guarda lo que eligió el dueño ya validado y
 * normalizado (`#rrggbb` en minúscula o `null`); el ajuste de contraste se calcula al mostrar.
 * Con `reset=1` (botón "Restablecer colores originales") guarda los dos en `null`.
 */
export async function updateBrandColors(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const reset = text(formData, "reset") === "1";
  const parsed = brandColorsSchema.safeParse(
    reset ? { primary: null, secondary: null } : { primary: text(formData, "primary"), secondary: text(formData, "secondary") },
  );
  if (!parsed.success) return { ok: false, error: INVALID, fieldErrors: firstFieldErrors(parsed.error) };

  const session = await ownerSession();
  if (!session) return FORBIDDEN;

  const { primary, secondary } = parsed.data;
  await db.barbershop.update({
    where: { id: session.barbershopId },
    data: { brandPrimary: primary, brandSecondary: secondary },
  });

  invalidate(session);
  return {
    ok: true,
    message: reset ? "Volviste a los colores originales." : "Colores guardados.",
    values: { primary: primary ?? "", secondary: secondary ?? "" },
  };
}
