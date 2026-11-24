import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Lock, NotebookPen, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PanelBody, PanelHeader } from "@/components/panel/panel-header";
import { TodaySkeleton } from "@/components/panel/skeletons";
import { requireSession } from "@/lib/auth";
import { formatPrice } from "@/lib/money";
import { APPOINTMENT_STATUS_LABELS, OPEN_APPOINTMENT_STATUSES, PAYMENT_METHOD_LABELS } from "@/lib/records";
import { localTime } from "@/lib/time";
import {
  isDayClosed,
  listActiveBarbers,
  listActiveServiceOptions,
  listTodayAppointments,
  listTodayRecords,
  todayOf,
  totalOf,
  type AppointmentStatusValue,
  type BarberOption,
  type ServiceOption,
  type TodayAppointment,
  type TodayScope,
} from "@/server/queries/records";
import { AppointmentStatusButtons, CompleteAppointmentForm } from "./appointment-actions";
import { formatLongDate, initials } from "./format";
import { WalkInForm } from "./walk-in-form";

export const metadata: Metadata = { title: "Cuaderno del día — Barber" };

const statusVariant: Record<AppointmentStatusValue, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING: "outline",
  CONFIRMED: "secondary",
  COMPLETED: "default",
  CANCELLED: "destructive",
  NO_SHOW: "destructive",
};

function isOpen(status: AppointmentStatusValue): boolean {
  return (OPEN_APPOINTMENT_STATUSES as readonly string[]).includes(status);
}

const customerLinkClass =
  "inline-flex min-h-11 items-center font-medium text-foreground underline-offset-4 hover:underline";

function AppointmentItem({
  appointment,
  timeZone,
  services,
  barbers,
  currentUserId,
  closed,
}: {
  appointment: TodayAppointment;
  timeZone: string;
  services: ServiceOption[];
  /** Sólo para OWNER (elige quién atendió al completar); `null` para BARBER. */
  barbers: BarberOption[] | null;
  currentUserId: string;
  closed: boolean;
}) {
  const open = isOpen(appointment.status);
  // El servicio del turno se ofrece aunque se haya desactivado después de reservar.
  const options = services.some((s) => s.id === appointment.service.id)
    ? services
    : [{ id: appointment.service.id, name: appointment.service.name, price: appointment.service.price }, ...services];

  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="min-w-14 text-lg font-semibold tabular-nums">{localTime(appointment.startsAt, timeZone)}</span>
        <div className="flex min-w-0 flex-1 flex-col">
          <Link href={`/dashboard/today/customers/${appointment.customer.id}`} className={customerLinkClass}>
            {appointment.customer.name}
          </Link>
          <a
            href={`tel:+${appointment.customer.phone}`}
            className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Phone className="size-3.5" aria-hidden />
            {appointment.customer.phone}
          </a>
          <p className="text-sm text-muted-foreground">
            {appointment.service.name} · {appointment.barber ? appointment.barber.name : "Sin asignar"}
          </p>
          {appointment.customer.notes ? (
            <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
              Notas: {appointment.customer.notes}
            </p>
          ) : null}
        </div>
        <Badge variant={statusVariant[appointment.status]}>{APPOINTMENT_STATUS_LABELS[appointment.status]}</Badge>
      </div>

      {open && !closed ? (
        <div className="flex flex-col gap-2">
          <details className="group rounded-lg border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground [&::-webkit-details-marker]:hidden">
              Completar turno
            </summary>
            <div className="px-3 py-3">
              <CompleteAppointmentForm
                appointmentId={appointment.id}
                defaultServiceId={appointment.service.id}
                services={options}
                barbers={barbers}
                assignedBarberId={appointment.barber?.id ?? null}
                currentUserId={currentUserId}
              />
            </div>
          </details>
          <AppointmentStatusButtons appointmentId={appointment.id} customerName={appointment.customer.name} />
        </div>
      ) : null}
    </li>
  );
}

async function TodayContent() {
  const session = await requireSession();
  const timeZone = session.barbershop.timezone;
  const scope: TodayScope = {
    barbershopId: session.barbershopId,
    timeZone,
    actor: { userId: session.userId, role: session.role },
  };
  const isOwner = session.role === "OWNER";
  const date = todayOf(scope);

  const [appointments, records, services, barbers, closed] = await Promise.all([
    listTodayAppointments(scope, date),
    listTodayRecords(scope, date),
    listActiveServiceOptions(session.barbershopId),
    isOwner ? listActiveBarbers(session.barbershopId) : Promise.resolve(null),
    isDayClosed(session.barbershopId, date),
  ]);
  const total = totalOf(records);

  return (
    <>
      <PanelHeader
        title="Hoy"
        context={formatLongDate(date)}
        action={
          <Link
            href="/dashboard/account"
            aria-label="Mi cuenta"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-(--panel-header-foreground) font-semibold"
          >
            {initials(session.user.name)}
          </Link>
        }
      />
      <PanelBody>

        {closed ? (
          <p className="flex items-center gap-2 rounded-xl border bg-muted px-4 py-3 text-sm" role="status">
            <Lock className="size-4 shrink-0" aria-hidden />
            La caja de hoy ya está cerrada: no se pueden registrar más cortes.
          </p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <NotebookPen className="size-5" aria-hidden />
                Corte sin turno
              </CardTitle>
              <CardDescription>Elegí el servicio y confirmá. Cliente y barbero son opcionales.</CardDescription>
            </CardHeader>
            <CardContent>
              <WalkInForm services={services} barbers={barbers} currentUserId={session.userId} />
            </CardContent>
          </Card>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="turnos-hoy">
          <h2 id="turnos-hoy" className="flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="size-5" aria-hidden />
            Turnos de hoy <span className="text-muted-foreground">({appointments.length})</span>
          </h2>
          {appointments.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No hay turnos para hoy.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {appointments.map((appointment) => (
                <AppointmentItem
                  key={appointment.id}
                  appointment={appointment}
                  timeZone={timeZone}
                  services={services}
                  barbers={barbers}
                  currentUserId={session.userId}
                  closed={closed}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="registros-hoy">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="registros-hoy" className="text-lg font-semibold">
              Cortes de hoy <span className="text-muted-foreground">({records.length})</span>
            </h2>
            <p className="text-right">
              <span className="text-sm text-muted-foreground">Total </span>
              <span className="text-lg font-semibold tabular-nums">{formatPrice(total)}</span>
            </p>
          </div>
          {records.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Todavía no se registró ningún corte hoy.
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border bg-card">
              {records.map((record) => (
                <li key={record.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="min-w-10 font-semibold tabular-nums">#{record.dailyNumber}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {localTime(record.createdAt, timeZone)} · {record.barber.name}
                      {record.fromAppointment ? " · con turno" : ""}
                    </p>
                    {record.customer ? (
                      <Link href={`/dashboard/today/customers/${record.customer.id}`} className={customerLinkClass}>
                        {record.customer.name}
                      </Link>
                    ) : (
                      <p className="text-muted-foreground">Sin cliente</p>
                    )}
                    <p className="text-sm">{record.items.map((item) => item.serviceName).join(" + ")}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatPrice(record.total)}</span>
                    <Badge variant="secondary">{PAYMENT_METHOD_LABELS[record.paymentMethod]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PanelBody>
    </>
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayContent />
    </Suspense>
  );
}
