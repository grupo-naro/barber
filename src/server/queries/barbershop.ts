// Lecturas del panel de configuración. El `barbershopId` lo pasa el llamador y SIEMPRE
// tiene que salir de la sesión del servidor (ver `src/lib/auth.ts`).
import "server-only";
import { db } from "@/lib/db";
import { MAX_RANGES_PER_DAY, type DayHoursData, type TimeRange } from "@/lib/barbershop-settings";
import { isValidTime } from "@/lib/slots";

export type SettingsProfile = {
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  address: string | null;
  whatsapp: string | null;
};

export type BarbershopSettings = {
  profile: SettingsProfile;
  /**
   * Siempre 7 días, ordenados por weekday (0 = domingo), con sus franjas ordenadas por apertura.
   * Un día sin franjas válidas sale cerrado (con las horas viejas de sus filas, si había, para
   * precargar el form si lo vuelven a abrir).
   */
  hours: DayHoursData[];
};

export async function getBarbershopSettings(barbershopId: string): Promise<BarbershopSettings | null> {
  const shop = await db.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      name: true,
      slug: true,
      logoUrl: true,
      description: true,
      address: true,
      whatsapp: true,
      openingHours: {
        select: { weekday: true, closed: true, opensAt: true, closesAt: true },
      },
    },
  });
  if (!shop) return null;

  const hours: DayHoursData[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    // Filas con horas "HH:mm" coherentes (apertura < cierre), ordenadas por apertura.
    const withTimes = shop.openingHours
      .filter((h) => h.weekday === weekday)
      .filter(
        (h): h is typeof h & TimeRange =>
          typeof h.opensAt === "string" &&
          typeof h.closesAt === "string" &&
          isValidTime(h.opensAt) &&
          isValidTime(h.closesAt) &&
          h.opensAt < h.closesAt,
      )
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    const open = withTimes.filter((h) => !h.closed);
    const toRange = (h: TimeRange): TimeRange => ({ opensAt: h.opensAt, closesAt: h.closesAt });
    if (open.length === 0) {
      return { weekday, closed: true, ranges: withTimes.slice(0, MAX_RANGES_PER_DAY).map(toRange) };
    }
    return { weekday, closed: false, ranges: open.map(toRange) };
  });

  return {
    profile: {
      name: shop.name,
      slug: shop.slug,
      logoUrl: shop.logoUrl,
      description: shop.description,
      address: shop.address,
      whatsapp: shop.whatsapp,
    },
    hours,
  };
}
