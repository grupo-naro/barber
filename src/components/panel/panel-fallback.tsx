"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import {
  AccountSkeleton,
  BarberDetailSkeleton,
  BarbersSkeleton,
  CashSkeleton,
  CustomerSkeleton,
  GenericSkeleton,
  ServiceDetailSkeleton,
  ServicesSkeleton,
  SettingsSkeleton,
  TodaySkeleton,
} from "./skeletons";

function RouteSkeleton() {
  const [, , section, sub] = usePathname().split("/");
  if (section === "today") return sub ? <CustomerSkeleton /> : <TodaySkeleton />;
  if (section === "cash") return <CashSkeleton />;
  if (section === "services") return sub ? <ServiceDetailSkeleton /> : <ServicesSkeleton />;
  if (section === "barbers") return sub ? <BarberDetailSkeleton /> : <BarbersSkeleton />;
  if (section === "settings") return <SettingsSkeleton />;
  if (section === "account") return <AccountSkeleton />;
  return <GenericSkeleton />;
}

/**
 * Fallback de los layouts del panel: el título y el esqueleto de la pantalla a la que se está entrando. Hace
 * falta porque entre "Mi cuenta" y el resto cambia el layout, y su `<Suspense>` tapa el de la página.
 * En las fichas la ruta no se conoce al prerenderizar: el `<Suspense>` de adentro muestra el genérico.
 */
export function PanelFallback() {
  return (
    <Suspense fallback={<GenericSkeleton />}>
      <RouteSkeleton />
    </Suspense>
  );
}
