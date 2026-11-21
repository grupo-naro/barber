import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { getBarber } from "@/server/queries/barbers";
import { describePayout } from "../format";
import { BarberForm } from "./barber-form";
import { RegenerateInviteForm } from "./regenerate-form";

export const metadata: Metadata = { title: "Barbero — Barber" };

async function BarberDetail({ params }: { params: PageProps<"/dashboard/barbers/[id]">["params"] }) {
  const session = await requireRole("OWNER");
  const { id } = await params;
  // Lookup por `id` Y `barbershopId` de la sesión: un id de otra barbería da 404.
  const user = await getBarber(session.barbershopId, id);
  if (!user) notFound();
  const pending = user.role === "BARBER" && user.status === "PENDING";

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{user.name}</h1>
          {user.role === "OWNER" ? (
            <Badge variant="secondary">Dueño/a</Badge>
          ) : pending ? (
            <Badge>Invitación pendiente</Badge>
          ) : (
            <Badge variant="outline">Activo</Badge>
          )}
        </div>
        <p className="text-sm break-all text-muted-foreground">{user.email}</p>
        <p className="text-sm text-muted-foreground">Actual: {describePayout(user.payoutScheme, user.payoutValue)}</p>
      </div>

      {pending ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Invitación</h2>
            </CardTitle>
            <CardDescription>
              Todavía no eligió su contraseña. Si perdió el link o se venció, generá uno nuevo: los anteriores dejan de
              servir.
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
    </>
  );
}

export default function BarberDetailPage({ params }: PageProps<"/dashboard/barbers/[id]">) {
  return (
    <>
      <Link
        href="/dashboard/barbers"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver a barberos
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <BarberDetail params={params} />
      </Suspense>
    </>
  );
}
