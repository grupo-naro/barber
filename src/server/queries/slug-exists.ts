// Chequeo de existencia de un slug público (lo usa Proxy para responder 404 real).
// Solo devuelve un booleano: no expone ningún campo del tenant. Una barbería SUSPENDED cuenta como
// inexistente (404, igual que un slug que nunca existió: no se revela que está suspendida), igual que una con
// el cobro activado y sin primer pago. Una con el cobro vencido (`BLOCKED`) sigue existiendo.
import { db } from "@/lib/db";
import { publicBarbershopWhere } from "@/server/queries/public-barbershop-where";

export async function barbershopSlugExists(slug: string): Promise<boolean> {
  const shop = await db.barbershop.findUnique({ where: { slug, AND: [publicBarbershopWhere] }, select: { id: true } });
  return shop !== null;
}
