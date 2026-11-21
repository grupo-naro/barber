// Validación pura de las imágenes subidas por las barberías (galería, portada, logo).
// Sin Node fs ni Next: la usan el storage, el route handler `/media/...`, las actions y el cliente.

export type ImageType = "jpg" | "png" | "webp";

/** Tope por archivo (el cliente achica antes; el servidor rechaza igual lo que pase de acá). */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Máximo de fotos en la galería de una barbería. */
export const MAX_GALLERY_IMAGES = 24;

/** Lado máximo (px) al que el cliente achica las imágenes antes de subirlas. */
export const UPLOAD_MAX_DIMENSION = 1600;

export const IMAGE_CONTENT_TYPES: Record<ImageType, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

/**
 * Tipo de imagen según los magic bytes (nunca según el nombre ni el MIME que manda el cliente).
 * Solo JPEG, PNG y WebP; cualquier otra cosa (SVG, GIF, HTML…) → `null`.
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  // "RIFF" <4 bytes de tamaño> "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

const SHOP_ID_RE = /^[a-z0-9]{20,40}$/;
const FILE_NAME_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

/** `true` si el id tiene el formato de un id de barbería (cuid) apto para usar como carpeta. */
export function isMediaOwnerId(id: string): boolean {
  return SHOP_ID_RE.test(id);
}

/**
 * Key relativa (`<barbershopId>/<archivo>`) a partir de los segmentos de `/media/...`.
 * Exactamente 2 segmentos con formato estricto; cualquier otra cosa (`..`, `%2e%2e`, barras
 * invertidas, segmentos extra, extensiones no permitidas) → `null`.
 */
export function parseMediaPath(segments: readonly string[]): string | null {
  if (segments.length !== 2) return null;
  const [id, file] = segments;
  if (!SHOP_ID_RE.test(id) || !FILE_NAME_RE.test(file)) return null;
  return `${id}/${file}`;
}

/** Valida una key completa (`<id>/<archivo>`) y la devuelve tal cual, o `null`. */
export function parseMediaKey(key: string): string | null {
  return parseMediaPath(key.split("/"));
}

/** Extensión de una key ya validada. */
export function mediaKeyType(key: string): ImageType | null {
  const valid = parseMediaKey(key);
  if (!valid) return null;
  return valid.slice(valid.lastIndexOf(".") + 1) as ImageType;
}

/** URL pública de una key. */
export function mediaUrl(key: string): string {
  return `/media/${key}`;
}

/**
 * Si `url` es una URL `/media/<key>` de esta barbería, devuelve la key; si no (URL externa,
 * key de otra barbería o formato inválido), `null`.
 */
export function mediaKeyFromUrl(url: string | null | undefined, barbershopId: string): string | null {
  if (!url || !url.startsWith("/media/")) return null;
  const key = parseMediaKey(url.slice("/media/".length));
  if (!key || !key.startsWith(`${barbershopId}/`)) return null;
  return key;
}

/** Dimensiones para achicar `w`×`h` de modo que el lado mayor sea ≤ `max`. Nunca agranda. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = max / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
