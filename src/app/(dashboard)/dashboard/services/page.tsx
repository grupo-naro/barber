import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { listServices } from "@/server/queries/services";
import { ActiveToggle } from "./active-toggle";
import { BulkPriceForm } from "./bulk-price-form";
import { formatDuration } from "./format";
import { ServiceForm } from "./service-form";

export const metadata: Metadata = { title: "Servicios — Barber" };

async function ServicesContent() {
  const session = await requireSession();
  const services = await listServices(session.barbershopId);
  const isOwner = session.role === "OWNER";
  const active = services.filter((s) => s.active);

  return (
    <>
      {isOwner ? (
        <details className="group rounded-xl border bg-card">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
            <Plus className="size-4 transition-transform group-open:rotate-45" aria-hidden />
            Nuevo servicio
          </summary>
          <div className="border-t px-4 py-4">
            <ServiceForm />
          </div>
        </details>
      ) : null}

      {services.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Todavía no hay servicios cargados.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Servicios">
          {services.map((service) => (
            <li
              key={service.id}
              className={cn(
                "flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center",
                !service.active && "bg-muted/40",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-medium", !service.active && "text-muted-foreground")}>
                    {service.name}
                  </span>
                  {!service.active ? <Badge variant="outline">Inactivo</Badge> : null}
                  {!service.showOnline ? <Badge variant="secondary">Oculto online</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground tabular-nums">
                  <span className="font-medium text-foreground">{formatPrice(service.price)}</span>
                  {" · "}
                  {formatDuration(service.durationMinutes)}
                </p>
                {service.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{service.description}</p>
                ) : null}
              </div>
              {isOwner ? (
                <div className="grid grid-cols-2 gap-2 sm:w-64">
                  <Link
                    href={`/dashboard/services/${service.id}`}
                    className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}
                    aria-label={`Editar ${service.name}`}
                  >
                    <Pencil />
                    Editar
                  </Link>
                  <ActiveToggle id={service.id} name={service.name} active={service.active} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Actualizar precios</CardTitle>
            <CardDescription>
              Subí o bajá los precios de varios servicios a la vez. Antes de aplicar ves cómo queda cada uno.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BulkPriceForm services={active.map(({ id, name, price }) => ({ id, name, price }))} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function ServicesSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando servicios">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export default function ServicesPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Servicios</h1>
        <p className="text-muted-foreground">Lo que ofrecés, cuánto sale y cuánto dura.</p>
      </div>
      <Suspense fallback={<ServicesSkeleton />}>
        <ServicesContent />
      </Suspense>
    </>
  );
}
