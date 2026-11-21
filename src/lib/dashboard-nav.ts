import type { SessionRole } from "@/lib/session";

// Navegación del panel: lógica pura (sin React). Ocultar links es solo UX;
// la autorización real sigue en cada página y en las Server Actions.

export type DashboardNavItem = { href: string; label: string };

const NAV_ITEMS: readonly (DashboardNavItem & { ownerOnly: boolean })[] = [
  { href: "/dashboard/today", label: "Hoy", ownerOnly: false },
  { href: "/dashboard/services", label: "Servicios", ownerOnly: true },
  { href: "/dashboard/cash", label: "Caja", ownerOnly: true },
  { href: "/dashboard/settings", label: "Configuración", ownerOnly: true },
];

/** Ítems visibles para el rol, en orden. Devuelve objetos planos (serializables para un Client Component). */
export function navItemsForRole(role: SessionRole): DashboardNavItem[] {
  return NAV_ITEMS.filter((item) => role === "OWNER" || !item.ownerOnly).map(({ href, label }) => ({ href, label }));
}

/** Activo si el pathname es el href o una subruta (`/dashboard/today/customers/x` activa Hoy; `/dashboard/todayx` no). */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
