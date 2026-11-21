import "server-only";
// Lecturas de servicios para el panel. El `barbershopId` lo pasa el llamador y SIEMPRE sale
// de la sesión del servidor (`requireSession()`), nunca del cliente.
import { db } from "@/lib/db";
import { centsToPrice, priceToCents } from "@/lib/pricing";

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  /** Precio como string decimal ("12000.00"): nunca float. */
  price: string;
  durationMinutes: number;
  active: boolean;
  showOnline: boolean;
  sortOrder: number;
};

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  durationMinutes: true,
  active: true,
  showOnline: true,
  sortOrder: true,
} as const;

function toRow<T extends { price: { toString(): string } }>(service: T): Omit<T, "price"> & { price: string } {
  return { ...service, price: centsToPrice(priceToCents(service.price)) };
}

/** Servicios de la barbería: activos primero, después por `sortOrder` y nombre. */
export async function listServices(barbershopId: string): Promise<ServiceRow[]> {
  const services = await db.service.findMany({
    where: { barbershopId },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: serviceSelect,
  });
  return services.map(toRow);
}

/** Un servicio de la barbería, o `null` si no existe o es de otra barbería. */
export async function getService(barbershopId: string, id: string): Promise<ServiceRow | null> {
  const service = await db.service.findFirst({ where: { id, barbershopId }, select: serviceSelect });
  return service ? toRow(service) : null;
}
