"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Sheet } from "@/components/panel/sheet";
import { useToast } from "@/components/panel/toast";
import { useSheetAction } from "@/components/panel/use-sheet-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/money";
import { normalizePhone, sumPrices, type PaymentMethodValue } from "@/lib/records";
import { cn } from "@/lib/utils";
import { createWalkIn, lookupCustomer, type CustomerLookup, type RecordFormState } from "@/server/actions/records";
import type { BarberOption, ServiceOption } from "@/server/queries/records";
import { BarberSelect, PaymentPicker, pickBarber, ServiceTiles, SheetError, toggleId } from "./fields";
import { ctaClass, recordNetworkError, submitClass } from "./format";

/** Lo elegido en la hoja. Vive en `TodayBoard`: cerrarla lo conserva; registrar o salir de Hoy lo limpia. */
export type WalkInDraft = {
  serviceIds: string[];
  payment: PaymentMethodValue;
  /** `null` = quien usa el panel. */
  barberId: string | null;
  customerOpen: boolean;
  phone: string;
  name: string;
  customer: CustomerLookup | null;
};

export const EMPTY_DRAFT: WalkInDraft = {
  serviceIds: [],
  payment: "CASH",
  barberId: null,
  customerOpen: false,
  phone: "",
  name: "",
  customer: null,
};

/** Espera antes de buscar el cliente por teléfono. */
const LOOKUP_DELAY_MS = 350;

const inputClass = "h-12 rounded-[10px] border-2 md:text-base";

/** "Ir" del teclado cierra el teclado: registrar es siempre un toque en el botón. */
function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

export function WalkInSheet({
  open,
  onClose,
  returnFocus,
  draft,
  onDraft,
  services,
  barbers,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
  draft: WalkInDraft;
  onDraft: (update: (draft: WalkInDraft) => WalkInDraft) => void;
  services: readonly ServiceOption[];
  /** Sólo para el dueño: puede elegir cualquier barbero activo. */
  barbers: readonly BarberOption[] | null;
  currentUserId: string;
}) {
  const formId = useId();
  const toast = useToast();
  const confirmed = useRef<string | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPhone = useRef("");

  const { submit, reset, locked, error } = useSheetAction<NonNullable<RecordFormState>>({
    action: createWalkIn,
    onNetworkError: recordNetworkError,
    onSuccess: (message) => {
      confirmed.current = message;
      onDraft(() => EMPTY_DRAFT);
      onClose();
    },
  });

  useEffect(() => {
    return () => {
      // Al salir de Hoy: ni búsqueda pendiente ni resultado que llegue tarde.
      if (timer.current) clearTimeout(timer.current);
      latestPhone.current = "";
    };
  }, []);

  // Un servicio del borrador que se desactivó mientras tanto no se cuenta ni se envía.
  const selected = draft.serviceIds.filter((id) => services.some((s) => s.id === id));
  const total = sumPrices(services.filter((s) => selected.includes(s.id)).map((s) => s.price));
  const known = draft.customer?.found ? draft.customer : null;
  const set = (patch: Partial<WalkInDraft>) => onDraft((prev) => ({ ...prev, ...patch }));

  function onPhoneChange(value: string) {
    set({ phone: value, customer: null });
    if (timer.current) clearTimeout(timer.current);
    const normalized = normalizePhone(value);
    latestPhone.current = normalized ?? "";
    if (!normalized) {
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      let result: CustomerLookup | null = null;
      try {
        result = await lookupCustomer(normalized);
      } catch {
        // Sin conexión: se sigue como cliente sin buscar; el servidor lo resuelve al registrar.
      }
      if (latestPhone.current !== normalized) return;
      set({ customer: result });
      setSearching(false);
    }, LOOKUP_DELAY_MS);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onClosed={() => {
        reset();
        if (confirmed.current) toast(confirmed.current);
        confirmed.current = null;
      }}
      returnFocus={returnFocus}
      locked={locked}
      title="Corte sin turno"
      footer={
        <>
          <SheetError message={error} />
          <Button
            type="submit"
            form={formId}
            disabled={locked || selected.length === 0}
            className={cn(ctaClass, submitClass(locked))}
          >
            {locked ? "Registrando…" : selected.length === 0 ? "Elegí un servicio" : `Registrar ${formatPrice(total)}`}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          // Sin `action` en el form: React lo reiniciaría al terminar y, con error, hay que conservar todo.
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
        className="flex flex-col gap-3"
      >
        <ServiceTiles
          services={services}
          selected={selected}
          onToggle={(id) => onDraft((prev) => ({ ...prev, serviceIds: toggleId(prev.serviceIds, id) }))}
        />
        <PaymentPicker value={draft.payment} onChange={(payment) => set({ payment })} />
        {barbers ? (
          <BarberSelect
            id={`${formId}-barber`}
            label="¿Quién atendió?"
            barbers={barbers}
            currentUserId={currentUserId}
            value={pickBarber(barbers, draft.barberId, currentUserId)}
            onChange={(barberId) => set({ barberId })}
          />
        ) : null}

        <div className="rounded-[10px] border-2">
          <button
            type="button"
            aria-expanded={draft.customerOpen}
            aria-controls={`${formId}-customer`}
            onClick={() => set({ customerOpen: !draft.customerOpen })}
            className="panel-row flex min-h-12 w-full items-center gap-2 rounded-lg px-3 text-left font-medium"
          >
            <span className="min-w-0 flex-1 truncate">
              Cliente{" "}
              <span className="font-normal text-muted-foreground">{known ? `· ${known.name}` : "(opcional)"}</span>
            </span>
            <ChevronDown className={draft.customerOpen ? "size-5 shrink-0 rotate-180" : "size-5 shrink-0"} aria-hidden />
          </button>
          {/* Plegado sigue en el formulario: lo cargado se envía igual. */}
          <div id={`${formId}-customer`} hidden={!draft.customerOpen} className="border-t-2 p-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${formId}-phone`} className="text-base">
                  Teléfono
                </Label>
                <Input
                  id={`${formId}-phone`}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  enterKeyHint="done"
                  maxLength={40}
                  value={draft.phone}
                  onChange={(e) => onPhoneChange(e.target.value)}
                  onKeyDown={blurOnEnter}
                  className={inputClass}
                  placeholder="11 2345-6789"
                />
              </div>
              {searching ? (
                <p role="status" className="text-muted-foreground">
                  Buscando cliente…
                </p>
              ) : null}
              {known ? (
                <div className="flex flex-col rounded-[10px] bg-secondary px-3 py-2">
                  <p className="font-semibold wrap-anywhere">{known.name}</p>
                  <p className="text-sm wrap-anywhere whitespace-pre-line text-muted-foreground">
                    {known.notes ? `Notas: ${known.notes}` : "Sin notas de corte."}
                  </p>
                  <Link
                    href={`/dashboard/today/customers/${known.id}`}
                    className="inline-flex min-h-11 w-fit items-center pr-2 font-medium underline underline-offset-4"
                  >
                    Ver ficha
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${formId}-name`} className="text-base">
                    Nombre{" "}
                    <span className="font-normal text-muted-foreground">
                      {draft.customer && !draft.customer.found ? "(cliente nuevo)" : ""}
                    </span>
                  </Label>
                  <Input
                    id={`${formId}-name`}
                    name="name"
                    autoComplete="off"
                    enterKeyHint="done"
                    maxLength={80}
                    value={draft.name}
                    onChange={(e) => set({ name: e.target.value })}
                    onKeyDown={blurOnEnter}
                    className={inputClass}
                    placeholder="Nombre del cliente"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
