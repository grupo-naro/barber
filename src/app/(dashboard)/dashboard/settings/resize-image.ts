// Achica una imagen en el navegador antes de subirla (sin dependencias): createImageBitmap +
// <canvas> → WebP calidad 0.85, o JPEG si el navegador no codifica WebP. Re-codificar también
// descarta los metadatos EXIF (ubicación, cámara) de la foto original.
import { UPLOAD_MAX_DIMENSION, fitWithin } from "@/lib/media";

const QUALITY = 0.85;

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/**
 * Decodifica respetando la orientación EXIF. Safari/iOS viejos rechazan el objeto de opciones
 * de `createImageBitmap`: ahí se reintenta sin opciones (los navegadores actuales ya aplican
 * EXIF por defecto) y, si tampoco existe la API, se decodifica con un `<img>`.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // sigue con <img>
      }
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error("No pudimos leer esa imagen. Probá con un JPG, PNG o WebP.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function resizeImage(file: File, max = UPLOAD_MAX_DIMENSION): Promise<File> {
  const bitmap = await decode(file);
  try {
    const srcW = bitmap instanceof HTMLImageElement ? bitmap.naturalWidth : bitmap.width;
    const srcH = bitmap instanceof HTMLImageElement ? bitmap.naturalHeight : bitmap.height;
    if (!srcW || !srcH) throw new Error("No pudimos leer esa imagen. Probá con un JPG, PNG o WebP.");
    const { width, height } = fitWithin(srcW, srcH, max);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Tu navegador no pudo procesar la imagen.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Algunos navegadores ignoran "image/webp" y devuelven PNG: en ese caso, JPEG.
    let blob = await toBlob(canvas, "image/webp");
    let ext = "webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await toBlob(canvas, "image/jpeg");
      ext = "jpg";
    }
    if (!blob) throw new Error("Tu navegador no pudo procesar la imagen.");
    const base = file.name.replace(/\.[^.]*$/, "") || "imagen";
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } finally {
    if (!(bitmap instanceof HTMLImageElement)) bitmap.close();
  }
}
