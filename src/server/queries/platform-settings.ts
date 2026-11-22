// Ajustes de la plataforma (fila única `id = "singleton"`): datos de transferencia y WhatsApp de contacto.
// Solo lectura acá; se cargan desde el admin. Los muestra la pantalla de pago del dueño (nunca la del barbero).
import type { PlatformSettings } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export async function getPlatformSettings(): Promise<PlatformSettings | null> {
  return db.platformSettings.findUnique({ where: { id: "singleton" } });
}
