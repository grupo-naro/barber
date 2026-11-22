import type { ReactNode } from "react";
import { CreditCard, MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { requireSession, type Session } from "@/lib/auth";
import { canUsePanel } from "@/lib/billing";
import { transferWhatsappUrl } from "@/lib/billing-access";
import { cn } from "@/lib/utils";
import { getPlatformSettings } from "@/server/queries/platform-settings";
import { CopyValueButton } from "./copy-value-button";

// Corte del panel por cobro. Lo usa `dashboard/layout.tsx` (todo `/dashboard/*` salvo "Mi cuenta", que vive en
// el route group `(account)`). Las mutaciones se cortan aparte, con `requirePanelAccess` en cada server action.
// Es Server Component. Lo único que viaja como prop a un componente cliente son el alias y el CBU/CVU (para el
// botón "Copiar"), y solo en la rama OWNER: el barbero no recibe ningún dato de pago.

/** Contenido del panel, o la pantalla de pago si el cobro bloquea el panel. Va dentro de un `<Suspense>`. */
export async function PanelGate({ children }: { children: ReactNode }) {
  const session = await requireSession();
  if (canUsePanel(session.barbershop.billingState)) return children;
  return <BillingGate session={session} />;
}

/** Link de MP solo si es https (lo genera MP; se guarda desde el admin). */
function safeHttpsUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export async function BillingGate({ session }: { session: Session }) {
  if (session.role !== "OWNER") {
    // El barbero no ve datos de pago: ni `PlatformSettings`, ni `payerEmail`, ni el link de MP.
    return (
      <Card role="alert">
        <CardHeader>
          <CardTitle>
            <h1 className="text-lg font-semibold">Panel no disponible</h1>
          </CardTitle>
          <CardDescription>La barbería tiene un pago pendiente. Hablá con el dueño.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const shop = session.barbershop;
  const awaiting = shop.billingState === "AWAITING_FIRST_PAYMENT";
  const settings = await getPlatformSettings();
  const mpLink = shop.mpStatus === "pending" ? safeHttpsUrl(shop.mpInitPoint) : null;
  const mpAuthorized = shop.mpStatus === "authorized";
  // `copy`: nombre del dato para el botón "Copiar" (el titular no se copia).
  const transfer = [
    { label: "Alias", value: settings?.transferAlias, copy: "alias" },
    { label: "CBU/CVU", value: settings?.transferCbu, copy: "CBU/CVU" },
    { label: "Titular", value: settings?.transferHolder, copy: null },
  ].filter((row): row is { label: string; value: string; copy: string | null } => Boolean(row.value?.trim()));
  const whatsapp = transferWhatsappUrl(settings?.contactWhatsapp, shop.name);
  const nothingToShow = !mpLink && !mpAuthorized && transfer.length === 0 && !whatsapp;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {awaiting ? "Esperando tu primer pago" : "Tu suscripción tiene un pago pendiente"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {awaiting
            ? "Cuando se acredite el primer pago se habilita el panel y se publica la página de tu barbería."
            : "El panel queda bloqueado hasta que se acredite el pago. Tu página y las reservas online siguen funcionando."}
        </p>
      </div>

      {/* Sin suscripción vigente en MP (`cancelled` o ninguna) no hay nada que pagar ahí: ni botón ni aviso del mail. */}
      {mpLink || mpAuthorized ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Mercado Pago</h2>
            </CardTitle>
            {shop.payerEmail ? (
              <CardDescription>
                Pagá con la cuenta de Mercado Pago de <span className="font-medium break-all text-foreground">{shop.payerEmail}</span>.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {mpLink ? (
              <a
                href={mpLink}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ size: "lg" }), "h-11 w-full sm:w-auto")}
              >
                <CreditCard aria-hidden />
                Pagar con Mercado Pago
              </a>
            ) : null}
            {mpAuthorized ? (
              <p className="text-sm">
                Tu suscripción está activa, pero el último cobro no se pudo hacer. Entrá a tu cuenta de Mercado Pago,
                andá a <span className="font-medium">Suscripciones</span> y cambiá el medio de pago: el cobro se
                reintenta solo.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {transfer.length > 0 || whatsapp ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Transferencia</h2>
            </CardTitle>
            <CardDescription>
              {transfer.length > 0
                ? "También podés pagar por transferencia y avisarnos por WhatsApp."
                : "Escribinos por WhatsApp para pagar por transferencia."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {transfer.length > 0 ? (
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
                {transfer.map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium break-all">{row.value}</span>
                      {row.copy ? <CopyValueButton value={row.value} label={row.copy} /> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 w-full sm:w-auto")}
              >
                <MessageCircle aria-hidden />
                Avisar por WhatsApp
              </a>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {nothingToShow ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay un medio de pago cargado. Contactá al administrador de la plataforma.
        </p>
      ) : null}
    </div>
  );
}
