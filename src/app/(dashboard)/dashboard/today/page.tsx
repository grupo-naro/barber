import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PanelHeader } from "@/components/panel/panel-header";
import { TodaySkeleton } from "@/components/panel/skeletons";
import { requireSession } from "@/lib/auth";
import {
  isDayClosed,
  listActiveBarbers,
  listActiveServiceOptions,
  listTodayAppointments,
  listTodayRecords,
  todayOf,
  totalOf,
  type TodayScope,
} from "@/server/queries/records";
import { formatLongDate, initials } from "./format";
import { TodayBoard } from "./today-board";

export const metadata: Metadata = { title: "Hoy — Barber" };

async function TodayContent() {
  const session = await requireSession();
  const timeZone = session.barbershop.timezone;
  const now = new Date();
  const scope: TodayScope = {
    barbershopId: session.barbershopId,
    timeZone,
    actor: { userId: session.userId, role: session.role },
    now,
  };
  const date = todayOf(scope);

  const [appointments, records, services, barbers, closed] = await Promise.all([
    listTodayAppointments(scope, date),
    listTodayRecords(scope, date),
    listActiveServiceOptions(session.barbershopId),
    session.role === "OWNER" ? listActiveBarbers(session.barbershopId) : Promise.resolve(null),
    isDayClosed(session.barbershopId, date),
  ]);

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
      {/* Al cliente viaja solo lo que se muestra: las notas del turno y los ids internos de los cortes, no. */}
      <TodayBoard
        key={session.userId}
        role={session.role}
        currentUserId={session.userId}
        timeZone={timeZone}
        serverNow={now.getTime()}
        appointments={appointments.map((appointment) => ({ ...appointment, notes: null }))}
        records={records.map((record) => ({
          id: record.id,
          dailyNumber: record.dailyNumber,
          createdAt: record.createdAt,
          barber: record.barber.name,
          fromAppointment: record.fromAppointment,
          customer: record.customer,
          services: record.items.map((item) => item.serviceName),
          paymentMethod: record.paymentMethod,
          total: record.total,
        }))}
        total={totalOf(records)}
        services={services}
        barbers={barbers}
        closed={closed}
      />
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
