"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CircleUser, Scissors, SlidersHorizontal, Users, Wallet, type LucideIcon } from "lucide-react";
import { isNavItemActive, type DashboardNavItem } from "@/lib/dashboard-nav";

const icons: Record<string, LucideIcon> = {
  "/dashboard/today": CalendarDays,
  "/dashboard/cash": Wallet,
  "/dashboard/services": Scissors,
  "/dashboard/barbers": Users,
  "/dashboard/settings": SlidersHorizontal,
  "/dashboard/account": CircleUser,
};

/** Adentro del `<Link>`: marca el destino apenas se toca, con una línea de tamaño fijo que no mueve nada. */
function Tab({ item, active }: { item: DashboardNavItem; active: boolean }) {
  const { pending } = useLinkStatus();
  const Icon = icons[item.href];
  return (
    <span
      className="panel-tab relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-0.5 text-[0.8125rem] leading-tight font-semibold sm:min-h-13 sm:flex-row sm:gap-2 sm:px-3 sm:text-[0.9375rem]"
      data-active={active ? "" : undefined}
      data-pending={pending ? "" : undefined}
    >
      <span
        aria-hidden
        className="panel-tab-line absolute inset-x-0 top-0 h-0.75 bg-foreground sm:top-auto sm:bottom-0"
      />
      {Icon ? <Icon className="size-5.25 shrink-0 sm:size-4.5" aria-hidden /> : null}
      <span className="max-w-full truncate">{item.label}</span>
    </span>
  );
}

/** Recibe los ítems ya filtrados por rol en el servidor; acá solo se marca el activo. */
export function DashboardNav({ items }: { items: DashboardNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones del panel"
      className="panel-nav fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom,0px)] sm:static sm:border-t-0 sm:border-b sm:pt-(--panel-safe-top) sm:pb-0"
    >
      <ul className="mx-auto flex max-w-3xl sm:gap-1 sm:px-1">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <li key={item.href} className="min-w-0 flex-1 sm:flex-none">
              <Link href={item.href} aria-current={active ? "page" : undefined} className="panel-tab-link flex">
                <Tab item={item} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Reserva el alto de la barra mientras no se sabe el rol. */
export function DashboardNavFallback() {
  return (
    <div
      aria-hidden
      className="panel-nav fixed inset-x-0 bottom-0 z-40 h-(--panel-bar) border-t bg-card sm:static sm:h-[calc(3.25rem+1px+var(--panel-safe-top))] sm:border-t-0 sm:border-b"
    />
  );
}
