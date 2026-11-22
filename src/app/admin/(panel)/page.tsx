import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Search } from "lucide-react";
import { requireAdminSession } from "@/lib/admin-auth";
import { billingState } from "@/lib/billing";
import { normalizeSearch } from "@/lib/platform-admin";
import { listBarbershopsWithMetrics } from "@/server/queries/admin";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateTime } from "./format";
import { BillingBadge } from "./billing-badge";
import { PlanBadge } from "./plan-badge";
import { BarbershopStatusBadge } from "./status-badge";

async function BarbershopsTable({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await requireAdminSession();
  const q = normalizeSearch((await searchParams).q);
  const now = new Date();
  const rows = await listBarbershopsWithMetrics(q, now);

  return (
    <>
      <form action="/admin" method="get" role="search" className="flex max-w-md gap-2">
        <label htmlFor="admin-search" className="sr-only">
          Buscar por nombre o slug
        </label>
        <Input id="admin-search" name="q" defaultValue={q} placeholder="Buscar por nombre o slug" className="h-9" />
        <Button type="submit" variant="outline" size="lg" className="h-9">
          <Search aria-hidden />
          Buscar
        </Button>
      </form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {rows.length === 1 ? "1 barbería" : `${rows.length} barberías`}
        {q ? ` para “${q}”` : ""}. Turnos y cortes del mes en curso (hora de Buenos Aires).
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Nombre</th>
              <th scope="col" className="px-3 py-2 font-medium">Slug</th>
              <th scope="col" className="px-3 py-2 font-medium">Estado</th>
              <th scope="col" className="px-3 py-2 font-medium">Cobro</th>
              <th scope="col" className="px-3 py-2 font-medium">Plan</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Barberos activos</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Turnos del mes</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Cortes del mes</th>
              <th scope="col" className="px-3 py-2 font-medium">Última actividad</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  No hay barberías{q ? " que coincidan con la búsqueda" : " todavía"}.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/admin/barbershops/${row.id}`} className="underline-offset-4 hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={`/${row.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      /{row.slug}
                      <ExternalLink className="size-3" aria-hidden />
                      <span className="sr-only">(se abre en una pestaña nueva)</span>
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    <BarbershopStatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <BillingBadge state={billingState({ billingEnabled: row.billingEnabled, paidUntil: row.planExpiresAt }, now)} />
                  </td>
                  <td className="px-3 py-2">
                    <PlanBadge plan={row.plan} planExpiresAt={row.planExpiresAt} timeZone={row.timezone} now={now} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.activeBarbers}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.appointmentsThisMonth}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.recordsThisMonth}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">{formatDateTime(row.lastActivityAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function AdminHomePage({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Barberías</h1>
        <Link href="/admin/barbershops/new" className={cn(buttonVariants({ size: "sm" }))}>
          <Plus aria-hidden />
          Nueva barbería
        </Link>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" aria-busy="true" />}>
        <BarbershopsTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}
