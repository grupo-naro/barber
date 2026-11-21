// Lecturas públicas de la página de reservas `/[slug]`.
// Sin sesión: el tenant SIEMPRE se resuelve en el servidor a partir del slug, y sólo
// se exponen campos públicos. Sin dependencias de Next (lo usa también un script).
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { computeHourlySlots, isOpenDay, isValidDate, weekdayOf } from "@/lib/slots";

type Client = Prisma.TransactionClient | typeof db;

/** Campos públicos de la barbería (nada interno: sin ids de usuarios, emails, etc.). */
export type PublicBarbershop = {
  slug: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  timezone: string;
};

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  /** Precio como string decimal ("12000.00"): nunca float. */
  price: string;
  durationMinutes: number;
};

// Solo barberías ACTIVE: una SUSPENDED no se muestra ni recibe reservas (como si no existiera).

export async function getPublicBarbershop(slug: string): Promise<PublicBarbershop | null> {
  return db.barbershop.findUnique({
    where: { slug, status: "ACTIVE" },
    select: {
      slug: true,
      name: true,
      logoUrl: true,
      description: true,
      address: true,
      phone: true,
      whatsapp: true,
      timezone: true,
    },
  });
}

/** Barbería ACTIVE por slug con su id, sólo para uso interno del servidor (suspendida → `null`). */
export async function resolveBarbershop(slug: string, client: Client = db) {
  return client.barbershop.findUnique({
    where: { slug, status: "ACTIVE" },
    select: { id: true, timezone: true },
  });
}

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  durationMinutes: true,
} as const;

/** Servicios visibles online de la barbería del slug, en orden de catálogo. */
export async function getOnlineServices(slug: string): Promise<PublicService[]> {
  const services = await db.service.findMany({
    where: { barbershop: { slug, status: "ACTIVE" }, active: true, showOnline: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: serviceSelect,
  });
  return services.map((s) => ({ ...s, price: s.price.toFixed(2) }));
}

/**
 * Franjas de atención (todas las filas) del día de semana de `date` en la barbería, ordenadas por
 * apertura. `[]` si no hay nada cargado o la fecha es inválida. Las filas cerradas/inválidas se
 * devuelven igual: `computeHourlySlots` / `isOpenDay` las ignoran.
 */
export async function getDayHours(client: Client, barbershopId: string, date: string) {
  if (!isValidDate(date)) return [];
  return client.openingHours.findMany({
    where: { barbershopId, weekday: weekdayOf(date) },
    select: { opensAt: true, closesAt: true, closed: true },
    orderBy: { opensAt: "asc" },
  });
}

/**
 * Horarios reservables (horas en punto) para un servicio en un día de negocio. Devuelve `null` si el
 * servicio no es de la barbería del slug o no se ofrece online. `open` indica si la barbería atiende
 * ese día. La grilla no depende de turnos existentes: varios turnos pueden compartir la hora.
 */
export async function getAvailableSlots(
  slug: string,
  input: { serviceId: string; date: string; now: Date },
): Promise<{ open: boolean; slots: Date[] } | null> {
  const shop = await resolveBarbershop(slug);
  if (!shop) return null;

  const service = await db.service.findFirst({
    where: { id: input.serviceId, barbershopId: shop.id, active: true, showOnline: true },
    select: { id: true },
  });
  if (!service) return null;

  const hours = await getDayHours(db, shop.id, input.date);
  const open = isOpenDay(hours);
  const slots = computeHourlySlots({ hours, date: input.date, timeZone: shop.timezone, now: input.now });
  return { open, slots };
}
