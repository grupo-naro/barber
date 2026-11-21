import { IMAGE_CONTENT_TYPES, mediaKeyType, parseMediaPath } from "@/lib/media";
import { readImage } from "@/server/media-storage";

// Sirve las imágenes subidas por las barberías: `/media/<barbershopId>/<32 hex>.<jpg|png|webp>`.
// Cualquier path con otro formato responde 404 sin tocar el disco. Los nombres son aleatorios
// y nunca se reescriben, así que la respuesta se puede cachear para siempre.

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(_request: Request, ctx: RouteContext<"/media/[...path]">) {
  const { path } = await ctx.params;
  const key = parseMediaPath(path);
  const type = key ? mediaKeyType(key) : null;
  if (!key || !type) return notFound();

  const data = await readImage(key);
  if (!data) return notFound();

  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": IMAGE_CONTENT_TYPES[type],
      "Content-Length": String(data.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
