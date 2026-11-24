import { Suspense, type CSSProperties, type ReactNode } from "react";
import type { Viewport } from "next";
import { Anton } from "next/font/google";
import { requireSession, type Session } from "@/lib/auth";
import { graceBannerMessage } from "@/lib/billing-access";
import { panelThemeVars } from "@/lib/brand-colors";
import { DashboardNav, DashboardNavFallback } from "@/components/dashboard-nav";
import { PanelFallback } from "@/components/panel/panel-fallback";
import { PanelPortalProvider } from "@/components/panel/portal-context";
import { ToastProvider } from "@/components/panel/toast";
import { navItemsForRole } from "@/lib/dashboard-nav";
import { planBanner, planBannerMessage } from "@/lib/platform-admin";
import { cn } from "@/lib/utils";
import { getPanelBrand } from "@/server/queries/landing";
import "./panel.css";

// Títulos y horas del panel. El cuerpo sigue en Geist.
const display = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const viewport: Viewport = { themeColor: "#000000", viewportFit: "cover" };

/**
 * Aviso de arriba de todo, solo para el dueño y con la fecha en la timezone de la barbería. No bloquea nada.
 * - `GRACE`: no se pudo cobrar la suscripción; fecha límite = "pagado hasta" + 12 días.
 * - `EXEMPT` (cobro desactivado): el aviso informativo del plan de siempre (`planBanner`).
 * - `PAID`: sin aviso. Con el panel bloqueado, el aviso es la pantalla de pago (`BillingGate`).
 */
function headerBanner(session: Session): { message: string; urgent: boolean } | null {
  if (session.role !== "OWNER") return null;
  const { billingState, planExpiresAt, timezone } = session.barbershop;
  if (billingState === "GRACE" && planExpiresAt) {
    return { message: graceBannerMessage(planExpiresAt, timezone), urgent: true };
  }
  if (billingState !== "EXEMPT") return null;
  const plan = planBanner(planExpiresAt, new Date(), timezone);
  const message = planBannerMessage(plan);
  return message ? { message, urgent: plan.kind === "expired" } : null;
}

const rootClass = cn(
  "panel-theme flex min-h-full flex-1 flex-col bg-background font-sans text-foreground",
  display.variable,
);

/** Sesión y colores de la barbería: va dentro de `<Suspense>`. El id de los colores sale siempre de la sesión. */
async function PanelShell({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const brand = await getPanelBrand(session.barbershopId);
  const banner = headerBanner(session);
  return (
    <div
      className={rootClass}
      style={panelThemeVars(brand.primary, brand.secondary) as CSSProperties}
      data-notice={banner ? "" : undefined}
    >
      <PanelPortalProvider>
        <ToastProvider>
          {banner ? (
            <p
              role="status"
              className={cn(
                "border-b bg-card px-4 pt-[calc(0.5rem+var(--panel-safe-top))] pb-2 text-center text-sm",
                banner.urgent ? "font-medium text-destructive" : "text-foreground",
              )}
            >
              {banner.message}
            </p>
          ) : null}
          {/* El filtrado por rol se hace acá, en el servidor, con el rol de la sesión. */}
          <DashboardNav items={navItemsForRole(session.role)} />
          <main className="flex flex-1 flex-col">{children}</main>
        </ToastProvider>
      </PanelPortalProvider>
    </div>
  );
}

function ShellFallback() {
  return (
    <div className={rootClass}>
      <DashboardNavFallback />
      <main className="flex flex-1 flex-col">
        <PanelFallback />
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <PanelShell>{children}</PanelShell>
    </Suspense>
  );
}
