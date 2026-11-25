"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Lock } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { localTime } from "@/lib/time";
import { appointmentTag, daySummary, isOpenAppointment, nowLineIndex } from "@/lib/today-board";
import { cn } from "@/lib/utils";
import type { BarberOption, ServiceOption, TodayAppointment } from "@/server/queries/records";
import { AppointmentSheet } from "./appointment-sheet";
import { ctaClass } from "./format";
import { RecordsSheet, type BoardRecord } from "./records-sheet";
import { EMPTY_DRAFT, WalkInSheet, type WalkInDraft } from "./walk-in-sheet";

type OpenSheet = { kind: "walk-in" } | { kind: "appointment"; id: string } | { kind: "records" } | null;

/** Al volver a la app, se actualiza solo si pasó este tiempo desde la última vez. */
const REFRESH_AFTER_MS = 30_000;

const toneClass = {
  accent: "text-(--brand)",
  neutral: "text-foreground",
  muted: "text-muted-foreground",
} as const;

/** Hora actual para la línea de ahora: arranca de la del servidor (no difiere al hidratar) y avanza cada minuto. */
function useNow(serverNow: number): Date {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        60_000 - (Date.now() % 60_000) + 50,
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  // Un refresco puede traer una hora del servidor más nueva que el último tick.
  return new Date(Math.max(now, serverNow));
}

/** Al volver a estar visible la app, trae los datos de nuevo. No mueve el scroll ni cierra la hoja. */
function useRefreshOnReturn() {
  const router = useRouter();
  const last = useRef(0);
  useEffect(() => {
    last.current = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last.current < REFRESH_AFTER_MS) return;
      last.current = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);
}

/** Resumen con la cantidad y el total en negrita. */
function Summary({ text }: { text: string }) {
  return text
    .split(/(\d+(?= cortes? por )|\$[\d.,]+)/)
    .map((part, index) => (index % 2 === 1 ? <b key={index}>{part}</b> : part));
}

function NowLine({ time }: { time: string }) {
  return (
    <li className="flex h-7.5 items-center gap-2.5 border-b px-4.5 text-sm font-semibold sm:px-4" data-now-line="">
      <span>
        <span className="sr-only">Ahora: </span>
        <span className="tabular-nums">{time}</span>
      </span>
      <span className="pole h-2 flex-1" aria-hidden />
    </li>
  );
}

function AppointmentRow({
  appointment,
  timeZone,
  isOwner,
  onOpen,
}: {
  appointment: TodayAppointment;
  timeZone: string;
  isOwner: boolean;
  onOpen: (trigger: HTMLElement) => void;
}) {
  const done = !isOpenAppointment(appointment.status);
  const tag = appointmentTag(appointment);
  const attended = isOwner && appointment.status === "COMPLETED" ? appointment.barber : null;
  return (
    <li>
      <button
        type="button"
        onClick={(event) => onOpen(event.currentTarget)}
        data-appointment={appointment.id}
        data-done={done ? "" : undefined}
        className={cn(
          "panel-row grid min-h-16.5 w-full grid-cols-[3.875rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b px-4.5 py-2.5 text-left sm:px-4",
          done ? "text-muted-foreground" : "bg-card",
        )}
      >
        <span className="panel-display text-[1.5625rem] leading-none">
          {localTime(appointment.startsAt, timeZone)}
        </span>
        <span className="min-w-0">
          <span className={cn("block truncate", !done && "font-semibold")}>{appointment.customer.name}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {appointment.service.name}
            {attended ? ` · ${attended.name}` : ""}
          </span>
        </span>
        <span className={cn("max-w-28 truncate text-sm font-semibold sm:max-w-48", toneClass[tag.tone])}>
          {tag.label}
        </span>
      </button>
    </li>
  );
}

/** Lo que va abajo, siempre a la vista: registrar un corte o por qué no se puede. */
function Dock({
  closed,
  noServices,
  isOwner,
  onWalkIn,
}: {
  closed: boolean;
  noServices: boolean;
  isOwner: boolean;
  onWalkIn: (trigger: HTMLElement) => void;
}) {
  const messageClass = "flex min-h-14 items-center justify-center gap-2 text-center font-medium";
  return (
    <div className="sticky bottom-(--panel-bar) z-10 mt-auto border-t bg-card px-3.5 py-2.5 sm:border-x" data-dock="">
      {closed ? (
        <p className={messageClass}>
          <Lock className="size-4 shrink-0" aria-hidden />
          La caja de hoy ya está cerrada
        </p>
      ) : noServices ? (
        isOwner ? (
          <Link href="/dashboard/services" className={cn(buttonVariants(), ctaClass)}>
            Cargá tus servicios
          </Link>
        ) : (
          <p className={messageClass}>Pedile al dueño que cargue los servicios</p>
        )
      ) : (
        <Button type="button" className={ctaClass} onClick={(event) => onWalkIn(event.currentTarget)}>
          Registrar corte
        </Button>
      )}
    </div>
  );
}

export function TodayBoard({
  role,
  currentUserId,
  timeZone,
  serverNow,
  appointments,
  records,
  total,
  services,
  barbers,
  closed,
}: {
  role: "OWNER" | "BARBER";
  currentUserId: string;
  timeZone: string;
  serverNow: number;
  /** En el orden del servidor: por hora y, en la misma hora, por orden de reserva. No se reordena. */
  appointments: TodayAppointment[];
  records: BoardRecord[];
  total: string;
  services: ServiceOption[];
  /** Solo para el dueño (elige quién atendió); `null` para el barbero. */
  barbers: BarberOption[] | null;
  closed: boolean;
}) {
  const isOwner = role === "OWNER";
  const now = useNow(serverNow);
  useRefreshOnReturn();

  const [open, setOpen] = useState<OpenSheet>(null);
  const [draft, setDraft] = useState<WalkInDraft>(EMPTY_DRAFT);
  const [visit, setVisit] = useState(0);
  const opener = useRef<HTMLElement | null>(null);

  // Next oculta Hoy al navegar (`<Activity>`), no la desmonta: al salir se cierra la hoja y se borra el
  // borrador (tiene datos de un cliente). `visit` vuelve a montar las hojas, para que al volver no quede nada.
  // Un `router.refresh()` no pasa por acá.
  useLayoutEffect(() => {
    return () => {
      setOpen(null);
      setDraft(EMPTY_DRAFT);
      setVisit((v) => v + 1);
    };
  }, []);

  function show(sheet: OpenSheet, trigger: HTMLElement) {
    opener.current = trigger;
    setOpen(sheet);
  }
  const close = useCallback(() => setOpen(null), []);

  const lineAt = nowLineIndex(
    appointments.map((a) => a.startsAt),
    now,
  );
  const nowLine = <NowLine time={localTime(now, timeZone)} />;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col pb-(--panel-bar)">
      <button
        type="button"
        onClick={(event) => show({ kind: "records" }, event.currentTarget)}
        className="panel-row flex min-h-13 w-full items-center justify-between gap-3 px-4.5 py-2 text-left sm:px-4"
        data-summary=""
      >
        <span className="min-w-0 wrap-anywhere">
          <Summary text={daySummary(role, records.length, total)} />
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {appointments.length === 0 ? (
        <p className="border-y bg-card px-4.5 py-10 text-center text-muted-foreground sm:border-x">
          No hay turnos para hoy.
        </p>
      ) : (
        <ul className="border-t sm:border-x" aria-label="Turnos de hoy">
          {appointments.map((appointment, index) => (
            <Fragment key={appointment.id}>
              {index === lineAt ? nowLine : null}
              <AppointmentRow
                appointment={appointment}
                timeZone={timeZone}
                isOwner={isOwner}
                onOpen={(trigger) => show({ kind: "appointment", id: appointment.id }, trigger)}
              />
            </Fragment>
          ))}
          {lineAt === appointments.length ? nowLine : null}
        </ul>
      )}

      <Dock
        closed={closed}
        noServices={services.length === 0}
        isOwner={isOwner}
        onWalkIn={(trigger) => show({ kind: "walk-in" }, trigger)}
      />

      <Fragment key={visit}>
        <RecordsSheet
          open={open?.kind === "records"}
          onClose={close}
          returnFocus={opener}
          records={records}
          total={total}
          timeZone={timeZone}
        />
        <WalkInSheet
          open={open?.kind === "walk-in"}
          onClose={close}
          returnFocus={opener}
          draft={draft}
          onDraft={setDraft}
          services={services}
          barbers={barbers}
          currentUserId={currentUserId}
        />
        <AppointmentSheet
          openId={open?.kind === "appointment" ? open.id : null}
          onClose={close}
          returnFocus={opener}
          appointments={appointments}
          services={services}
          barbers={barbers}
          currentUserId={currentUserId}
          timeZone={timeZone}
          closed={closed}
        />
      </Fragment>
    </div>
  );
}
