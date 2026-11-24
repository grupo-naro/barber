"use client";

import { useActionState, useState, useTransition } from "react";
import { Ban, CheckCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/money";
import { sumPrices, type PaymentMethodValue } from "@/lib/records";
import {
  completeAppointment,
  setAppointmentStatus,
  type ActionResult,
  type RecordFormState,
} from "@/server/actions/records";
import type { BarberOption, ServiceOption } from "@/server/queries/records";
import { BarberSelect, PaymentPicker, ResultMessage, ServiceChips, toggleId } from "./fields";

/**
 * Completar un turno: quién atendió (sólo OWNER) + servicios (el del turno preseleccionado; se pueden
 * sumar otros) + medio de pago. El BARBER no elige: el servidor lo asigna a él.
 */
export function CompleteAppointmentForm({
  appointmentId,
  defaultServiceId,
  services,
  barbers,
  assignedBarberId,
  currentUserId,
}: {
  appointmentId: string;
  defaultServiceId: string;
  services: ServiceOption[];
  /** Sólo para OWNER: barberos activos para "¿Quién atendió?". `null` para BARBER. */
  barbers: BarberOption[] | null;
  assignedBarberId: string | null;
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState<RecordFormState, FormData>(completeAppointment, null);
  const [selected, setSelected] = useState<string[]>([defaultServiceId]);
  const [payment, setPayment] = useState<PaymentMethodValue>("CASH");
  // Default: el barbero ya asignado si sigue activo; si no, quien está usando el panel.
  const [barberId, setBarberId] = useState(
    assignedBarberId && barbers?.some((b) => b.id === assignedBarberId) ? assignedBarberId : currentUserId,
  );
  const total = sumPrices(services.filter((s) => selected.includes(s.id)).map((s) => s.price));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {barbers ? (
        <BarberSelect
          id={`complete-barber-${appointmentId}`}
          label="¿Quién atendió?"
          barbers={barbers}
          currentUserId={currentUserId}
          value={barberId}
          onChange={setBarberId}
        />
      ) : null}
      <ServiceChips
        services={services}
        selected={selected}
        onToggle={(id) => setSelected((list) => toggleId(list, id))}
      />
      <PaymentPicker value={payment} onChange={setPayment} />
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending || selected.length === 0}>
        <CheckCheck />
        {pending ? "Completando…" : `Completar · ${formatPrice(total)}`}
      </Button>
      <ResultMessage state={state} pending={pending} />
    </form>
  );
}

/** "No vino" / "Cancelar" para un turno abierto de hoy. */
export function AppointmentStatusButtons({ appointmentId, customerName }: { appointmentId: string; customerName: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function mark(status: "NO_SHOW" | "CANCELLED") {
    const question =
      status === "NO_SHOW" ? `¿Marcar que ${customerName} no vino?` : `¿Cancelar el turno de ${customerName}?`;
    if (!window.confirm(question)) return;
    setResult(null);
    startTransition(async () => {
      setResult(await setAppointmentStatus(appointmentId, status));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="lg" className="h-11" disabled={pending} onClick={() => mark("NO_SHOW")}>
          <UserX />
          No vino
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          className="h-11"
          disabled={pending}
          onClick={() => mark("CANCELLED")}
        >
          <Ban />
          Cancelar turno
        </Button>
      </div>
      <ResultMessage state={result} pending={pending} />
    </div>
  );
}
