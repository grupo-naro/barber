// Chequeo de existencia de un slug público (lo usa Proxy para responder 404 real).
// Solo devuelve un booleano: no expone ningún campo del tenant. Una barbería SUSPENDED cuenta como
// inexistente (404, igual que un slug que nunca existió: no se revela que está suspendida).
import { db } from "@/lib/db";

export async function barbershopSlugExists(slug: string): Promise<boolean> {
  const shop = await db.barbershop.findUnique({ where: { slug, status: "ACTIVE" }, select: { id: true } });
  return shop !== null;
}
