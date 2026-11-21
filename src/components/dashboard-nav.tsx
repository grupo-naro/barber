"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Scissors, Settings, Users, Wallet, type LucideIcon } from "lucide-react";
import { isNavItemActive, type DashboardNavItem } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  "/dashboard/today": CalendarDays,
  "/dashboard/services": Scissors,
  "/dashboard/cash": Wallet,
  "/dashboard/barbers": Users,
  "/dashboard/settings": Settings,
};

/** Recibe los ítems ya filtrados por rol en el servidor; acá solo se marca el activo. */
export function DashboardNav({ items }: { items: DashboardNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones del panel"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] sm:static sm:border-t-0 sm:border-b sm:pb-0"
    >
      <ul className="mx-auto flex max-w-3xl sm:gap-1 sm:px-4">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = icons[item.href];
          return (
            <li key={item.href} className="min-w-0 flex-1 sm:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium transition-colors sm:min-h-11 sm:flex-row sm:gap-2 sm:rounded-md sm:px-3 sm:my-1 sm:text-sm",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {Icon ? <Icon className="size-5 sm:size-4" aria-hidden="true" /> : null}
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
