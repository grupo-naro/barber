// Lecturas del panel de configuración. El `barbershopId` lo pasa el llamador y SIEMPRE
// tiene que salir de la sesión del servidor (ver `src/lib/auth.ts`).
import "server-only";
import { db } from "@/lib/db";
import type { DayHoursData, PayoutSchemeValue } from "@/lib/barbershop-settings";

export type SettingsProfile = {
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  address: string | null;
  whatsapp: string | null;
};

export type SettingsUser = {
  id: string;
  name: string;
  role: "OWNER" | "BARBER";
  active: boolean;
  payoutScheme: PayoutSchemeValue;
  /** Decimal como string ("120000.00"): nunca float. */
  payoutValue: string;
};

export type BarbershopSettings = {
  profile: SettingsProfile;
  /** Siempre 7 días, ordenados por weekday (0 = domingo). Los días sin fila salen como cerrados. */
  hours: DayHoursData[];
  users: SettingsUser[];
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
      users: {
        orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
        select: { id: true, name: true, role: true, active: true, payoutScheme: true, payoutValue: true },
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
    users: shop.users.map((u) => ({ ...u, payoutValue: u.payoutValue.toFixed(2) })),
  };
}
