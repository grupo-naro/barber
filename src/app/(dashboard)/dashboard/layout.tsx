import { Suspense } from "react";
import { PanelFallback } from "@/components/panel/panel-fallback";
import { PanelGate } from "../billing-gate";

// Todo `/dashboard/*` salvo "Mi cuenta" (`(account)/dashboard/account`): con el panel bloqueado por cobro
// (`AWAITING_FIRST_PAYMENT` o `BLOCKED`) se muestra la pantalla de pago en lugar del contenido. La barra
// la pone `(dashboard)/layout.tsx`, y "Mi cuenta" (con "Cerrar sesión") sigue disponible.
// Las mutaciones se cortan en el servidor con `requirePanelAccess` en cada server action del panel.
export default function PanelLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <PanelGate>{children}</PanelGate>
    </Suspense>
  );
}
