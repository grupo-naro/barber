import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Editar “{service.name}”</CardTitle>
      </CardHeader>
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
  );
}

export default function EditServicePage({ params }: PageProps<"/dashboard/services/[id]">) {
  return (
    <>
      <Link
        href="/dashboard/services"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver a servicios
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <EditService params={params} />
      </Suspense>
    </>
  );
}
