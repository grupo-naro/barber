import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PanelBody, PanelHeader } from "@/components/panel/panel-header";
import { ServiceDetailSkeleton } from "@/components/panel/skeletons";
import { requireRole } from "@/lib/auth";
import { getService } from "@/server/queries/services";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Editar servicio — Barber" };

async function EditService({ params }: { params: PageProps<"/dashboard/services/[id]">["params"] }) {
  const session = await requireRole("OWNER");
  const { id } = await params;
  const service = id.length <= 64 ? await getService(session.barbershopId, id) : null;
  if (!service) notFound();

  return (
    <>
      <PanelHeader title="Editar servicio" context={service.name} backHref="/dashboard/services" />
      <PanelBody>
        <Card>
          <CardContent>
            <ServiceForm
              service={{
                id: service.id,
                values: {
                  name: service.name,
                  description: service.description ?? "",
                  price: service.price,
                  durationMinutes: String(service.durationMinutes),
                  showOnline: service.showOnline ? "on" : "",
                  sortOrder: String(service.sortOrder),
                },
              }}
            />
          </CardContent>
        </Card>
      </PanelBody>
    </>
  );
}

export default function EditServicePage({ params }: PageProps<"/dashboard/services/[id]">) {
  return (
    <Suspense fallback={<ServiceDetailSkeleton />}>
      <EditService params={params} />
    </Suspense>
  );
}
