// Lecturas del panel de configuración. El `barbershopId` lo pasa el llamador y SIEMPRE
// tiene que salir de la sesión del servidor (ver `src/lib/auth.ts`).
import "server-only";
import { db } from "@/lib/db";
import type { DayHoursData } from "@/lib/barbershop-settings";

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
  /** Siempre 7 días, ordenados por weekday (0 = domingo). Los días sin fila salen como cerrados. */
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

  const byWeekday = new Map(shop.openingHours.map((h) => [h.weekday, h]));
  const hours: DayHoursData[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const row = byWeekday.get(weekday);
    if (!row || row.closed || !row.opensAt || !row.closesAt) {
      return { weekday, closed: true, opensAt: row?.opensAt ?? null, closesAt: row?.closesAt ?? null };
    }
    return { weekday, closed: false, opensAt: row.opensAt, closesAt: row.closesAt };
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
