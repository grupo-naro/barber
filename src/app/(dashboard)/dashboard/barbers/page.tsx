import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { listBarbers } from "@/server/queries/barbers";
import { CreateBarberForm } from "./create-barber-form";
import { describePayout } from "./format";

export const metadata: Metadata = { title: "Barberos — Barber" };

async function BarbersContent() {
  const session = await requireRole("OWNER");
  const users = await listBarbers(session.barbershopId);

  return (
    <>
      {/* Card fija (no un <details>): el link recién generado no se tiene que ocultar al refrescar la lista. */}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UserPlus className="size-5" aria-hidden />
              Agregar barbero
            </h2>
          </CardTitle>
          <CardDescription>
            Le generamos un link para que elija su contraseña. Se lo mandás vos por WhatsApp o como prefieras.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateBarberForm barbershopName={session.barbershop.name} />
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold">Equipo</h2>
      <ul className="flex flex-col gap-3" aria-label="Equipo">
        {users.map((user) => (
          <li key={user.id}>
            <Link
              href={`/dashboard/barbers/${user.id}`}
              className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/60"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words">{user.name}</span>
                  {user.role === "OWNER" ? (
                    <Badge variant="secondary">Dueño/a</Badge>
                  ) : user.status === "ACTIVE" ? (
                    <Badge variant="outline">Activo</Badge>
                  ) : (
                    <Badge>Invitación pendiente</Badge>
                  )}
                  {!user.active ? <Badge variant="outline">Inactivo</Badge> : null}
                </div>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                <p className="text-sm text-muted-foreground">{describePayout(user.payoutScheme, user.payoutValue)}</p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function BarbersSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando barberos">
      <div className="h-12 animate-pulse rounded-xl bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

export default function BarbersPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Barberos</h1>
        <p className="text-sm text-muted-foreground">
          Sumá barberos con un link de invitación y definí cómo se le liquida a cada uno.
        </p>
      </div>
      <Suspense fallback={<BarbersSkeleton />}>
        <BarbersContent />
      </Suspense>
    </>
  );
}
