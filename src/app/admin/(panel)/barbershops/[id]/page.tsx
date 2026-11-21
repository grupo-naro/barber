import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireAdminSession } from "@/lib/admin-auth";
import { businessDate } from "@/lib/time";
import { getBarbershopForAdmin } from "@/server/queries/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "../../format";
import { PlanBadge } from "../../plan-badge";
import { BarbershopStatusBadge } from "../../status-badge";
import { AccessLinkForm } from "./access-link-form";
import { EditBarbershopForm } from "./edit-form";
import { StatusForm } from "./status-form";

function ownerSummary(owner: { name: string; email: string; hasPassword: boolean; active: boolean }): string {
  const access = owner.hasPassword ? "ya eligió contraseña" : "todavía no eligió contraseña";
  return `${owner.name} (${owner.email}) · ${access}${owner.active ? "" : " · inactivo"}.`;
}

async function BarbershopDetail({ params }: { params: PageProps<"/admin/barbershops/[id]">["params"] }) {
  await requireAdminSession();
  const { id } = await params;
  const shop = await getBarbershopForAdmin(id);
  if (!shop) notFound();
  const now = new Date();

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight break-words">{shop.name}</h1>
          <BarbershopStatusBadge status={shop.status} />
          <PlanBadge plan={shop.plan} planExpiresAt={shop.planExpiresAt} timeZone={shop.timezone} now={now} />
        </div>
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <a
            href={`/${shop.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs hover:text-foreground"
          >
            /{shop.slug}
            <ExternalLink className="size-3" aria-hidden />
            <span className="sr-only">(se abre en una pestaña nueva)</span>
          </a>
          <span>Alta: {formatDate(shop.createdAt, shop.timezone)}</span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              <h2 className="text-base font-semibold">Datos y plan</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EditBarbershopForm
              hasOwner={shop.owner !== null}
              values={{
                id: shop.id,
                name: shop.name,
                slug: shop.slug,
                ownerEmail: shop.owner?.email ?? "",
                plan: shop.plan,
                planExpiresAt: shop.planExpiresAt ? businessDate(shop.planExpiresAt, shop.timezone) : "",
              }}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-base font-semibold">Acceso del dueño</h2>
              </CardTitle>
              <CardDescription>
                {shop.owner ? ownerSummary(shop.owner) : "Esta barbería no tiene dueño cargado."} Al usarlo, el dueño elige
                una contraseña nueva. El link invalida los anteriores, sirve una sola vez y vence en 48 horas.
              </CardDescription>
            </CardHeader>
            <CardContent>{shop.owner ? <AccessLinkForm id={shop.id} /> : null}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 className="text-base font-semibold">Estado</h2>
              </CardTitle>
              <CardDescription>
                {shop.status === "ACTIVE"
                  ? "Suspender corta el panel, la página pública y las reservas. No se borra nada."
                  : "Suspendida: nadie de la barbería puede entrar y su página da 404. Al reactivarla vuelve todo como estaba."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatusForm id={shop.id} status={shop.status} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function AdminBarbershopPage({ params }: PageProps<"/admin/barbershops/[id]">) {
  return (
    <>
      <Link href="/admin" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Volver a barberías
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <BarbershopDetail params={params} />
      </Suspense>
    </>
  );
}
