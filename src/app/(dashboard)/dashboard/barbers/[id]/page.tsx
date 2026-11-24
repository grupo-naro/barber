import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PanelBody, PanelHeader } from "@/components/panel/panel-header";
import { BarberDetailSkeleton } from "@/components/panel/skeletons";
import { requireRole } from "@/lib/auth";
import { getBarber } from "@/server/queries/barbers";
import { describePayout } from "../format";
import { BarberStatusBadge } from "../status-badge";
import { BarberForm } from "./barber-form";
import { RegenerateInviteForm } from "./regenerate-form";

export const metadata: Metadata = { title: "Barbero — Barber" };

async function BarberDetail({ params }: { params: PageProps<"/dashboard/barbers/[id]">["params"] }) {
  const session = await requireRole("OWNER");
  const { id } = await params;
  // Lookup por `id` Y `barbershopId` de la sesión: un id de otra barbería da 404.
  const user = await getBarber(session.barbershopId, id);
  if (!user) notFound();
  // Sin contraseña (pendiente o con el link vencido) se puede generar un link nuevo.
  const pending = user.role === "BARBER" && user.status !== "ACTIVE";

  return (
    <>
      <PanelHeader title={user.name} context={user.email} backHref="/dashboard/barbers" />
      <PanelBody>
        <div className="flex flex-wrap items-center gap-2">
          {user.role === "OWNER" ? (
            <Badge variant="secondary">Dueño/a</Badge>
          ) : (
            <BarberStatusBadge status={user.status} />
          )}
          <p className="text-sm text-muted-foreground">Actual: {describePayout(user.payoutScheme, user.payoutValue)}</p>
        </div>

        {pending ? (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-lg font-semibold">Invitación</h2>
              </CardTitle>
              <CardDescription>
                {user.status === "EXPIRED"
                  ? "El link de invitación venció sin usarse. Generá uno nuevo y mandáselo."
                  : "Todavía no eligió su contraseña. Si perdió el link, generá uno nuevo: los anteriores dejan de servir."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegenerateInviteForm userId={user.id} barbershopName={session.barbershop.name} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Datos y liquidación</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarberForm
              user={{ id: user.id, name: user.name, payoutScheme: user.payoutScheme, payoutValue: user.payoutValue }}
            />
          </CardContent>
        </Card>
      </PanelBody>
    </>
  );
}

export default function BarberDetailPage({ params }: PageProps<"/dashboard/barbers/[id]">) {
  return (
    <Suspense fallback={<BarberDetailSkeleton />}>
      <BarberDetail params={params} />
    </Suspense>
  );
}
