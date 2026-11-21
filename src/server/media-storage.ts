import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMediaOwnerId, parseMediaKey, type ImageType } from "@/lib/media";

// Toda la IO de disco de los medios subidos por las barberías. Solo acepta keys validadas
// (`<barbershopId>/<32 hex>.<jpg|png|webp>`) y siempre comprueba que el path resuelto quede
// dentro de la raíz. Las keys se construyen con el `barbershopId` de la sesión del servidor.

// Los `turbopackIgnore` evitan que el build trace todo el proyecto por estos accesos dinámicos al disco.

/** Raíz del storage. En producción tiene que ser un volumen persistente (ver `.env.example`). */
export function uploadsRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.UPLOADS_DIR ?? "./storage/uploads");
}

/** Path absoluto de una key validada, o `null` si la key no es válida o escaparía de la raíz. */
function keyToPath(key: string): string | null {
  const valid = parseMediaKey(key);
  if (!valid) return null;
  const root = uploadsRoot();
  const [owner, file] = valid.split("/");
  const full = path.resolve(/*turbopackIgnore: true*/ root, owner, file);
  const rel = path.relative(root, full);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

/** `true` si la key es válida y pertenece a esa barbería. */
export function isKeyOfShop(key: string, barbershopId: string): boolean {
  return parseMediaKey(key) !== null && key.startsWith(`${barbershopId}/`);
}

/**
 * Escribe la imagen en `<raíz>/<barbershopId>/<random>.<ext>` y devuelve su key.
 * El nombre es aleatorio y la escritura usa `wx`: nunca pisa un archivo existente.
 */
export async function saveImage(barbershopId: string, bytes: Uint8Array, type: ImageType): Promise<string> {
  if (!isMediaOwnerId(barbershopId)) throw new Error("barbershopId inválido para el storage");
  const key = `${barbershopId}/${randomBytes(16).toString("hex")}.${type}`;
  const full = keyToPath(key);
  if (!full) throw new Error("key de medio inválida");
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ full, bytes, { flag: "wx" });
  return key;
}

/**
 * Borra el archivo de una key de esa barbería. Ignora archivos que ya no existen y
 * keys ajenas o inválidas (no toca el disco). Devuelve `true` si borró algo.
 */
export async function deleteImage(key: string, barbershopId: string): Promise<boolean> {
  if (!isKeyOfShop(key, barbershopId)) return false;
  const full = keyToPath(key);
  if (!full) return false;
  try {
    await unlink(/*turbopackIgnore: true*/ full);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Borrado "best effort": un fallo de disco se registra pero no rompe la mutación ya hecha en la DB. */
export async function deleteImageQuietly(key: string | null | undefined, barbershopId: string): Promise<void> {
  if (!key) return;
  try {
    await deleteImage(key, barbershopId);
  } catch (error) {
    console.error("No se pudo borrar el archivo de medios", key, error);
  }
}

/** Contenido de una key validada, o `null` si no es válida o no existe. */
export async function readImage(key: string): Promise<Buffer | null> {
  const full = keyToPath(key);
  if (!full) return null;
  try {
    return await readFile(/*turbopackIgnore: true*/ full);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR") return null;
    throw error;
  }
}
