import { Suspense } from "react";
import { PanelGate } from "../billing-gate";

// Todo `/dashboard/*` salvo "Mi cuenta" (`(account)/dashboard/account`): con el panel bloqueado por cobro
// (`AWAITING_FIRST_PAYMENT` o `BLOCKED`) se muestra la pantalla de pago en lugar del contenido. El header,
// "Mi cuenta" y "Cerrar sesión" los pone `(dashboard)/layout.tsx` y siguen disponibles.
// Las mutaciones se cortan en el servidor con `requirePanelAccess` en cada server action del panel.
export default function PanelLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
      <PanelGate>{children}</PanelGate>
    </Suspense>
  );
}
