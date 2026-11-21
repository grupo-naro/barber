import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getCustomerHistory } from "@/server/queries/records";
import { formatPrice, formatShortDate } from "../../format";
import { NotesForm } from "./notes-form";

export const metadata: Metadata = { title: "Ficha del cliente — Barber" };

async function CustomerContent({ params }: { params: PageProps<"/dashboard/today/customers/[id]">["params"] }) {
  const session = await requireSession();
  const { id } = await params;
  // El cliente se valida contra la barbería de la sesión: un id ajeno da 404.
  const customer = id.length <= 64 ? await getCustomerHistory(session.barbershopId, id) : null;
  if (!customer) notFound();

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
        <a
          href={`tel:+${customer.phone}`}
          className="inline-flex min-h-11 w-fit items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <Phone className="size-4" aria-hidden />
          {customer.phone}
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notas</CardTitle>
        </CardHeader>
        <CardContent>
          <NotesForm key={customer.notes ?? ""} customerId={customer.id} notes={customer.notes} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="historial">
        <h2 id="historial" className="text-lg font-semibold">
          Últimos cortes
        </h2>
        {customer.records.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no tiene cortes registrados.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {customer.records.map((record) => (
              <li key={record.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {formatShortDate(record.businessDate)} · {record.barber}
                  </p>
                  <p className="text-sm">{record.services.join(" + ")}</p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{formatPrice(record.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function CustomerPage({ params }: PageProps<"/dashboard/today/customers/[id]">) {
  return (
    <>
      <Link
        href="/dashboard/today"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver al cuaderno
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <CustomerContent params={params} />
      </Suspense>
    </>
  );
}
