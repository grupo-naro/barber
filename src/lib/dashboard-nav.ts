import type { SessionRole } from "@/lib/session";

// Navegación del panel: lógica pura (sin React). Ocultar links es solo UX;
// la autorización real sigue en cada página y en las Server Actions.

export type DashboardNavItem = { href: string; label: string };

// El dueño llega a "Mi cuenta" desde Hoy y Ajustes: su barra ya tiene cinco ítems.
const NAV_ITEMS: readonly (DashboardNavItem & { roles: readonly SessionRole[] })[] = [
  { href: "/dashboard/today", label: "Hoy", roles: ["OWNER", "BARBER"] },
  { href: "/dashboard/cash", label: "Caja", roles: ["OWNER"] },
  { href: "/dashboard/services", label: "Servicios", roles: ["OWNER"] },
  { href: "/dashboard/barbers", label: "Barberos", roles: ["OWNER"] },
  { href: "/dashboard/settings", label: "Ajustes", roles: ["OWNER"] },
  { href: "/dashboard/account", label: "Mi cuenta", roles: ["BARBER"] },
];

/** Ítems visibles para el rol, en orden. Devuelve objetos planos (serializables para un Client Component). */
export function navItemsForRole(role: SessionRole): DashboardNavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role)).map(({ href, label }) => ({ href, label }));
}

/** Activo si el pathname es el href o una subruta (`/dashboard/today/customers/x` activa Hoy; `/dashboard/todayx` no). */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
