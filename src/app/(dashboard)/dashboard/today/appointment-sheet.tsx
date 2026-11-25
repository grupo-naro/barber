"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { IdCard, Phone } from "lucide-react";
import { Sheet } from "@/components/panel/sheet";
import { useToast } from "@/components/panel/toast";
import { useSheetAction } from "@/components/panel/use-sheet-action";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/money";
import { APPOINTMENT_STATUS_LABELS, sumPrices, type PaymentMethodValue } from "@/lib/records";
import { localTime } from "@/lib/time";
import { findOpenTarget } from "@/lib/today-board";
import { cn } from "@/lib/utils";
import {
  completeAppointment,
  setAppointmentStatus,
  type ActionResult,
  type RecordFormState,
} from "@/server/actions/records";
import type { BarberOption, ServiceOption, TodayAppointment } from "@/server/queries/records";
import { BarberSelect, PaymentPicker, pickBarber, ServiceTiles, SheetError, toggleId } from "./fields";
import { ctaClass, recordNetworkError, submitClass } from "./format";

/** Lo que se está mostrando: se congela mientras guarda y mientras la hoja se cierra. */
type View = { state: "open" | "done"; appointment: TodayAppointment };
type Confirm = "NO_SHOW" | "CANCELLED" | null;

const GONE_MESSAGE = "Ese turno ya no está en tu lista";

const ghostClass = cn(
  buttonVariants({ variant: "outline" }),
  "h-12 min-w-0 gap-2 rounded-[10px] border-2 border-foreground text-base font-semibold",
);
/** Acción peligrosa: texto en rojo fijo, sin fondo, y siempre pide confirmación. */
const quietClass =
  "flex min-h-11 items-center justify-center rounded-[10px] px-2 text-center font-semibold text-destructive hover:underline underline-offset-4 disabled:opacity-50";

export function AppointmentSheet({
  openId,
  onClose,
  returnFocus,
  appointments,
  services,
  barbers,
  currentUserId,
  timeZone,
  closed,
}: {
  /** Turno abierto; `null` = cerrada. */
  openId: string | null;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
  appointments: readonly TodayAppointment[];
  services: readonly ServiceOption[];
  /** Sólo para el dueño: barberos activos para "¿Quién atendió?". `null` para el barbero. */
  barbers: readonly BarberOption[] | null;
  currentUserId: string;
  timeZone: string;
  closed: boolean;
}) {
  const formId = useId();
  const toast = useToast();
  /** Aviso que se emite cuando la hoja terminó de cerrarse. */
  const notice = useRef<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<View | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [payment, setPayment] = useState<PaymentMethodValue>("CASH");
  const [barberId, setBarberId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  function onSuccess(message: string) {
    notice.current = message;
    onClose();
  }
  const complete = useSheetAction<NonNullable<RecordFormState>>({
    action: completeAppointment,
    onNetworkError: recordNetworkError,
    onSuccess,
  });
  const status = useSheetAction<ActionResult>({
    // `setAppointmentStatus` no tiene forma de acción de formulario: este adaptador se la da.
    action: (_prev, formData) =>
      setAppointmentStatus(
        String(formData.get("appointmentId")),
        formData.get("status") === "CANCELLED" ? "CANCELLED" : "NO_SHOW",
      ),
    onNetworkError: (_prev, error) => ({ ok: false, error }),
    onSuccess,
  });
  const locked = complete.locked || status.locked;

  const target = openId ? findOpenTarget(appointments, openId) : null;

  // Al abrir: formulario limpio, con el servicio reservado marcado y el barbero asignado.
  if (openId !== loadedId) {
    setLoadedId(openId);
    if (target && target.state !== "gone") {
      setView(target);
      setServiceIds([target.appointment.service.id]);
      setPayment("CASH");
      setBarberId(target.appointment.barber?.id ?? null);
      setConfirm(null);
    }
  } else if (
    target &&
    target.state !== "gone" &&
    !locked &&
    (view?.appointment !== target.appointment || view.state !== target.state)
  ) {
    // Un refresco cambió el turno abierto. Con un envío en curso no se toca nada.
    setView(target);
    if (target.state === "done") setConfirm(null);
  }

  const gone = target?.state === "gone" && !locked;
  useEffect(() => {
    if (!gone) return;
    notice.current = GONE_MESSAGE;
    onClose();
  }, [gone, onClose]);

  const appointment = view?.appointment ?? null;
  const editable = view?.state === "open" && !closed;
  // El servicio del turno se ofrece aunque se haya desactivado después de reservar.
  const options =
    !appointment || services.some((s) => s.id === appointment.service.id)
      ? services
      : [appointment.service, ...services];
  const selected = serviceIds.filter((id) => options.some((s) => s.id === id));
  const total = sumPrices(options.filter((s) => selected.includes(s.id)).map((s) => s.price));
  const customer = appointment?.customer;

  function askConfirm(next: Confirm) {
    status.reset();
    setConfirm(next);
    // El botón que tenía el foco desaparece: sin esto quedaría afuera de la hoja.
    requestAnimationFrame(() => body.current?.focus());
  }

  function sendStatus(next: NonNullable<Confirm>) {
    if (!appointment) return;
    const formData = new FormData();
    formData.set("appointmentId", appointment.id);
    formData.set("status", next);
    status.submit(formData);
  }

  const footer = !editable ? undefined : confirm ? (
    <>
      <SheetError message={status.error} />
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={locked}
          onClick={() => sendStatus(confirm)}
          className={cn(quietClass, "min-h-12 border-2 border-destructive text-lg")}
        >
          {locked ? "Guardando…" : confirm === "NO_SHOW" ? "Sí, no vino" : "Sí, cancelar"}
        </button>
        <Button
          type="button"
          variant="outline"
          disabled={locked}
          onClick={() => askConfirm(null)}
          className="h-12 w-full rounded-[10px] border-2 border-foreground text-base font-semibold"
        >
          Volver
        </Button>
      </div>
    </>
  ) : (
    <>
      <SheetError message={complete.error} />
      <Button
        type="submit"
        form={formId}
        disabled={locked || selected.length === 0}
        className={cn(ctaClass, submitClass(locked))}
      >
        {locked ? "Completando…" : selected.length === 0 ? "Elegí un servicio" : `Completar ${formatPrice(total)}`}
      </Button>
    </>
  );

  return (
    <Sheet
      open={openId !== null && !gone}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onClosed={() => {
        complete.reset();
        status.reset();
        if (notice.current) toast(notice.current);
        notice.current = null;
      }}
      returnFocus={returnFocus}
      locked={locked}
      title={customer?.name ?? "Turno"}
      footer={footer}
    >
      {appointment && customer ? (
        <div ref={body} tabIndex={-1} className="flex flex-col gap-3 outline-none">
          {editable && confirm ? (
            <p className="py-2 text-lg font-medium wrap-anywhere">
              {confirm === "NO_SHOW"
                ? `¿Marcar que ${customer.name} no vino?`
                : `¿Cancelar el turno de ${customer.name}?`}
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="wrap-anywhere text-muted-foreground">
                  <span className="tabular-nums">{localTime(appointment.startsAt, timeZone)}</span> ·{" "}
                  {appointment.service.name} · {appointment.barber ? appointment.barber.name : "Sin asignar"}
                </p>
                {!editable ? (
                  <p className="font-medium">
                    {view?.state === "done"
                      ? APPOINTMENT_STATUS_LABELS[appointment.status]
                      : "La caja de hoy ya está cerrada"}
                  </p>
                ) : null}
                {customer.notes ? (
                  <p className="wrap-anywhere whitespace-pre-line">Nota: {customer.notes}</p>
                ) : null}
              </div>

              {editable ? (
                <form
                  id={formId}
                  onSubmit={(event) => {
                    // Sin `action` en el form: React lo reiniciaría al terminar y, con error, hay que conservar todo.
                    event.preventDefault();
                    complete.submit(new FormData(event.currentTarget));
                  }}
                  className="flex flex-col gap-3"
                >
                  <input type="hidden" name="appointmentId" value={appointment.id} />
                  <ServiceTiles
                    services={options}
                    selected={selected}
                    onToggle={(id) => setServiceIds((list) => toggleId(list, id))}
                  />
                  <PaymentPicker value={payment} onChange={setPayment} />
                  {barbers ? (
                    <BarberSelect
                      id={`${formId}-barber`}
                      label="¿Quién atendió?"
                      barbers={barbers}
                      currentUserId={currentUserId}
                      value={pickBarber(barbers, barberId, currentUserId)}
                      onChange={setBarberId}
                    />
                  ) : null}
                </form>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <a href={`tel:+${customer.phone.replace(/\D/g, "")}`} className={ghostClass}>
                  <Phone aria-hidden />
                  Llamar
                </a>
                <Link href={`/dashboard/today/customers/${customer.id}`} className={ghostClass}>
                  <IdCard aria-hidden />
                  Ver ficha
                </Link>
              </div>

              {editable ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={locked} onClick={() => askConfirm("NO_SHOW")} className={quietClass}>
                    No vino
                  </button>
                  <button type="button" disabled={locked} onClick={() => askConfirm("CANCELLED")} className={quietClass}>
                    Cancelar turno
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
