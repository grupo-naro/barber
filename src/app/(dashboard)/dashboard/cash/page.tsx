import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireRole } from "@/lib/auth";
import { PAYOUT_SCHEME_LABELS } from "@/lib/barbershop-settings";
import { addDays, isValidDate } from "@/lib/slots";
import { businessDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getCashDay, type CashBarberRow, type CashDay } from "@/server/queries/cash";
import { formatPrice } from "../services/format";
import { CloseCashForm } from "./close-form";

export const metadata: Metadata = { title: "Caja — Barber" };

const METHOD_LABELS = [
  ["CASH", "Efectivo"],
  ["TRANSFER", "Transferencia"],
  ["CARD", "Tarjeta"],
  ["OTHER", "Otro"],
] as const;

function isNegative(amount: string) {
  return amount.startsWith("-");
}

/** "jueves 20/11/2026" a partir de "2026-11-20" (sin depender de la zona del servidor). */
function formatDay(date: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function schemeLabel(row: CashBarberRow): string {
  if (row.scheme === "PERCENTAGE") return `${PAYOUT_SCHEME_LABELS.PERCENTAGE} · ${row.schemeValue.replace(/\.00$/, "")} %`;
  if (row.scheme === "FIXED_RENT") return `${PAYOUT_SCHEME_LABELS.FIXED_RENT} · ${formatPrice(row.schemeValue)}/día`;
  return PAYOUT_SCHEME_LABELS.NONE;
}

function Money({ amount, className }: { amount: string; className?: string }) {
  return (
    <span className={cn("tabular-nums", isNegative(amount) && "text-destructive", className)}>
      {formatPrice(amount)}
    </span>
  );
}

function DatePicker({ date, today }: { date: string; today: string }) {
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const navClass = cn(buttonVariants({ variant: "outline", size: "lg" }), "size-11 shrink-0 p-0");
  return (
    <form method="get" className="flex items-end gap-2">
      <Link href={`/dashboard/cash?date=${prev}`} className={navClass} aria-label="Día anterior">
        <ChevronLeft />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Label htmlFor="cash-date">Día</Label>
        <Input id="cash-date" type="date" name="date" defaultValue={date} max={today} required className="h-11" />
      </div>
      <Button type="submit" variant="outline" size="lg" className="h-11">
        Ver
      </Button>
      {next <= today ? (
        <Link href={`/dashboard/cash?date=${next}`} className={navClass} aria-label="Día siguiente">
          <ChevronRight />
        </Link>
      ) : (
        <span className={cn(navClass, "pointer-events-none opacity-50")} aria-hidden>
          <ChevronRight />
        </span>
      )}
    </form>
  );
}

function TotalsCard({ day }: { day: CashDay }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg font-semibold">Totales por medio de pago</h2>
        </CardTitle>
        <CardDescription>
          {day.recordCount === 0 ? "Sin cortes" : day.recordCount === 1 ? "1 corte" : `${day.recordCount} cortes`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {METHOD_LABELS.map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-base font-semibold">
                <Money amount={day.totals[key]} />
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-center justify-between rounded-lg border p-3">
          <span className="font-medium">Total</span>
          <Money amount={day.totals.total} className="text-lg font-semibold" />
        </div>
      </CardContent>
    </Card>
  );
}

function BarbersCard({ day }: { day: CashDay }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-lg font-semibold">Liquidación por barbero</h2>
        </CardTitle>
        <CardDescription>
          {day.status === "closed"
            ? "Según el acuerdo vigente al momento del cierre."
            : (
                <>
                  Según el acuerdo vigente de cada barbero (se edita en{" "}
                  <Link href="/dashboard/barbers" className="underline underline-offset-4 hover:text-foreground">
                    Barberos
                  </Link>
                  ).
                </>
              )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {day.barbers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cortes registrados este día.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border" aria-label="Barberos">
            {day.barbers.map((row) => (
              <li key={row.barberId} className="flex flex-col gap-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{row.name}</span>
                  <Badge variant="secondary">{schemeLabel(row)}</Badge>
                </div>
                <dl className="grid grid-cols-1 gap-1 text-sm min-[420px]:grid-cols-3 min-[420px]:gap-2">
                  <div className="flex justify-between gap-2 min-[420px]:flex-col min-[420px]:justify-start">
                    <dt className="text-muted-foreground">Facturó</dt>
                    <dd>
                      <Money amount={row.gross} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 min-[420px]:flex-col min-[420px]:justify-start">
                    <dt className="text-muted-foreground">Le corresponde</dt>
                    <dd className="font-medium">
                      <Money amount={row.barberAmount} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 min-[420px]:flex-col min-[420px]:justify-start">
                    <dt className="text-muted-foreground">Barbería</dt>
                    <dd>
                      <Money amount={row.shopAmount} />
                    </dd>
                  </div>
                </dl>
                {isNegative(row.barberAmount) ? (
                  <p className="text-sm font-medium text-destructive">
                    Debe a la barbería {formatPrice(row.barberAmount.slice(1))}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <dl className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt>Total a pagar a barberos</dt>
            <dd className="font-semibold">
              <Money amount={day.barberTotal} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt>Queda para la barbería</dt>
            <dd className="font-semibold">
              <Money amount={day.shopTotal} />
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

async function CashContent({ searchParams }: { searchParams: PageProps<"/dashboard/cash">["searchParams"] }) {
  const session = await requireRole("OWNER");
  const timeZone = session.barbershop.timezone;
  const today = businessDate(new Date(), timeZone);
  const raw = (await searchParams).date;
  const requested = typeof raw === "string" ? raw : "";
  // Fecha inválida o futura → hoy (en la timezone de la barbería).
  const date = isValidDate(requested) && requested <= today ? requested : today;

  const day = await getCashDay(session.barbershopId, date);
  const dayLabel = formatDay(date);

  return (
    <>
      <DatePicker date={date} today={today} />

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold first-letter:uppercase">{dayLabel}</h2>
        {day.status === "closed" ? (
          <Badge>
            <Lock />
            Caja cerrada
          </Badge>
        ) : (
          <Badge variant="outline">Caja abierta</Badge>
        )}
      </div>

      <TotalsCard day={day} />
      <BarbersCard day={day} />

      {day.status === "closed" ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Cierre</h2>
            </CardTitle>
            <CardDescription>
              Cerró {day.closedByName} el{" "}
              {new Intl.DateTimeFormat("es-AR", {
                timeZone,
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
              }).format(day.closedAt)}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {day.notes ? (
              <p className="whitespace-pre-wrap">{day.notes}</p>
            ) : (
              <p className="text-muted-foreground">Sin notas.</p>
            )}
            {day.openAfterClose > 0 ? (
              <p className="text-destructive">
                {day.openAfterClose === 1
                  ? "Hay 1 corte de este día sin cerrar (se cargó durante el cierre)."
                  : `Hay ${day.openAfterClose} cortes de este día sin cerrar (se cargaron durante el cierre).`}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Cerrar caja</h2>
            </CardTitle>
            <CardDescription>
              Guarda los totales y la liquidación de cada barbero. Una vez cerrada, no se puede modificar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CloseCashForm
              date={date}
              dateLabel={dayLabel}
              totalLabel={formatPrice(day.totals.total)}
              debtors={day.barbers.filter((b) => isNegative(b.barberAmount)).length}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function CashSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando caja">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export default function CashPage({ searchParams }: PageProps<"/dashboard/cash">) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Caja</h1>
        <p className="text-muted-foreground">Cierre diario por medio de pago y liquidación de cada barbero.</p>
      </div>
      <Suspense fallback={<CashSkeleton />}>
        <CashContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
