import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PanelBody, PanelHeader } from "@/components/panel/panel-header";
import { BarbersSkeleton } from "@/components/panel/skeletons";
import { requireRole } from "@/lib/auth";
import { listBarbers, type BarberListItem } from "@/server/queries/barbers";
import { CreateBarberForm } from "./create-barber-form";
import { BarberStatusBadge } from "./status-badge";
import { describePayout } from "./format";

export const metadata: Metadata = { title: "Barberos — Barber" };

/** "3 activos, 1 invitado": activos con acceso (incluye al dueño) e invitados que todavía no entraron. */
function teamSummary(users: readonly BarberListItem[]): string {
  const active = users.filter((u) => u.active && u.status === "ACTIVE").length;
  const invited = users.filter((u) => u.active && u.status !== "ACTIVE").length;
  const parts = [active === 1 ? "1 activo" : `${active} activos`];
  if (invited > 0) parts.push(invited === 1 ? "1 invitado" : `${invited} invitados`);
  return parts.join(", ");
}

async function BarbersContent() {
  const session = await requireRole("OWNER");
  const users = await listBarbers(session.barbershopId);

  return (
    <>
      <PanelHeader title="Barberos" context={teamSummary(users)} />
      <PanelBody>
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
                    ) : (
                      <BarberStatusBadge status={user.status} />
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
      </PanelBody>
    </>
  );
}

export default function BarbersPage() {
  return (
    <Suspense fallback={<BarbersSkeleton />}>
      <BarbersContent />
    </Suspense>
  );
}
