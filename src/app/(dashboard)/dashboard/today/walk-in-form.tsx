"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { NotebookPen, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/money";
import { normalizePhone, sumPrices, type PaymentMethodValue } from "@/lib/records";
import {
  createWalkIn,
  lookupCustomer,
  type CustomerLookup,
  type RecordFormState,
} from "@/server/actions/records";
import type { BarberOption, ServiceOption } from "@/server/queries/records";
import { PaymentPicker, ResultMessage, ServiceChips, toggleId } from "./fields";
import { nativeControlClass } from "./format";

type Props = {
  services: ServiceOption[];
  /** Sólo para OWNER: puede elegir cualquier barbero activo. */
  barbers: BarberOption[] | null;
  currentUserId: string;
  disabled?: boolean;
};

export function WalkInForm(props: Props) {
  const [state, action, pending] = useActionState<RecordFormState, FormData>(createWalkIn, null);
  return (
    <div className="flex flex-col gap-3">
      {/* Tras un alta exitosa cambia `resetKey` y el formulario vuelve a los defaults; con error se conserva. */}
      <WalkInFields key={state?.resetKey ?? 0} {...props} action={action} pending={pending} />
      <ResultMessage state={state} pending={pending} />
    </div>
  );
}

function WalkInFields({
  services,
  barbers,
  currentUserId,
  disabled,
  action,
  pending,
}: Props & { action: (formData: FormData) => void; pending: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [payment, setPayment] = useState<PaymentMethodValue>("CASH");
  const [barberId, setBarberId] = useState(currentUserId);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState<CustomerLookup | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPhone = useRef("");

  const total = sumPrices(services.filter((s) => selected.includes(s.id)).map((s) => s.price));

  function onPhoneChange(value: string) {
    setPhone(value);
    setCustomer(null);
    if (timer.current) clearTimeout(timer.current);
    const normalized = normalizePhone(value);
    latestPhone.current = normalized ?? "";
    if (!normalized) {
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const result = await lookupCustomer(normalized);
        if (latestPhone.current === normalized) setCustomer(result);
      } catch {
        if (latestPhone.current === normalized) setCustomer(null);
      } finally {
        if (latestPhone.current === normalized) setSearching(false);
      }
    }, 350);
  }

  const known = customer?.found ? customer : null;

  return (
    <form action={action} className="flex flex-col gap-5">
      <ServiceChips
        services={services}
        selected={selected}
        onToggle={(id) => setSelected((list) => toggleId(list, id))}
        disabled={disabled}
      />

      <PaymentPicker value={payment} onChange={setPayment} disabled={disabled} />

      {barbers ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="walkin-barber">Barbero</Label>
          <select
            id="walkin-barber"
            name="barberId"
            value={barberId}
            onChange={(e) => setBarberId(e.target.value)}
            className={nativeControlClass}
            disabled={disabled}
          >
            {barbers.map((barber) => (
              <option key={barber.id} value={barber.id}>
                {barber.name}
                {barber.id === currentUserId ? " (vos)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <details className="group rounded-lg border">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <UserRound className="size-4" aria-hidden />
          Cliente <span className="font-normal text-muted-foreground">(opcional)</span>
        </summary>
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="walkin-phone">Teléfono</Label>
            <Input
              id="walkin-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={40}
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              className="h-11"
              placeholder="11 2345-6789"
              disabled={disabled}
            />
          </div>
          {searching ? <p className="text-sm text-muted-foreground">Buscando cliente…</p> : null}
          {known ? (
            <div className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 text-sm">
              <p>
                <span className="font-medium">{known.name}</span>{" "}
                <Link
                  href={`/dashboard/today/customers/${known.id}`}
                  className="inline-flex min-h-11 items-center px-1 text-primary underline-offset-4 hover:underline"
                >
                  Ver ficha
                </Link>
              </p>
              <p className="whitespace-pre-line text-muted-foreground">
                {known.notes ? `Notas: ${known.notes}` : "Sin notas de corte."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="walkin-name">
                Nombre{" "}
                <span className="font-normal text-muted-foreground">
                  {customer && !customer.found ? "(cliente nuevo)" : ""}
                </span>
              </Label>
              <Input
                id="walkin-name"
                name="name"
                autoComplete="off"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11"
                placeholder="Nombre del cliente"
                disabled={disabled}
              />
            </div>
          )}
        </div>
      </details>

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={disabled || pending || selected.length === 0}
      >
        <NotebookPen />
        {pending ? "Registrando…" : selected.length === 0 ? "Elegí un servicio" : `Registrar corte · ${formatPrice(total)}`}
      </Button>
    </form>
  );
}
