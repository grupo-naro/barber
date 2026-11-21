// Chequeo de existencia de un slug público (lo usa Proxy para responder 404 real).
// Solo devuelve un booleano: no expone ningún campo del tenant.
import { db } from "@/lib/db";

export async function barbershopSlugExists(slug: string): Promise<boolean> {
  const shop = await db.barbershop.findUnique({ where: { slug }, select: { id: true } });
  return shop !== null;
}
