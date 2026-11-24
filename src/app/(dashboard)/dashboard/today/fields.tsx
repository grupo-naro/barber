// Controles compartidos por los formularios del cuaderno (se usan desde componentes de cliente).
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/money";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethodValue } from "@/lib/records";
import type { BarberOption, ServiceOption } from "@/server/queries/records";
import { chipClass, nativeControlClass } from "./format";

/** Fila seleccionable de servicio: ancho completo, ≥ 44px, mismo lenguaje visual que los chips. */
const serviceRowClass = `${chipClass} w-full rounded-lg px-3`;

export function ServiceChips({
  services,
  selected,
  onToggle,
  disabled,
  legend = "Servicios",
}: {
  services: readonly ServiceOption[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
  legend?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay servicios activos. Cargalos en Servicios.</p>
      ) : (
        // Una fila por servicio (2 columnas desde sm): nombre a la izquierda, precio alineado a la derecha.
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {services.map((service) => {
            const checked = selected.includes(service.id);
            return (
              <label key={service.id} className={serviceRowClass}>
                <input
                  type="checkbox"
                  name="serviceIds"
                  value={service.id}
                  checked={checked}
                  onChange={() => onToggle(service.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className="flex size-5 shrink-0 items-center justify-center rounded-md border border-current opacity-80"
                >
                  {checked ? <Check className="size-3.5" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{service.name}</span>
                <span className="shrink-0 tabular-nums opacity-80">{formatPrice(service.price)}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export function PaymentPicker({
  value,
  onChange,
  disabled,
}: {
  value: PaymentMethodValue;
  onChange: (value: PaymentMethodValue) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">Medio de pago</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PAYMENT_METHODS.map((method) => (
          <label key={method} className={`${chipClass} justify-center rounded-lg`}>
            <input
              type="radio"
              name="paymentMethod"
              value={method}
              checked={value === method}
              onChange={() => onChange(method)}
              className="sr-only"
            />
            {PAYMENT_METHOD_LABELS[method]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Mensaje de resultado en una región `aria-live` siempre montada. */
export function ResultMessage({
  state,
  pending,
}: {
  state: { ok: true; message: string } | { ok: false; error: string } | null | undefined;
  pending: boolean;
}) {
  const message = pending || !state ? "" : state.ok ? state.message : state.error;
  return (
    <p
      role="status"
      aria-live="polite"
      className={state && !state.ok ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
    >
      {message}
    </p>
  );
}

/** Alterna un id en una lista (para los chips). */
export function toggleId(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Selector nativo de barbero activo (≥ 44px). Marca al usuario de la sesión con "(vos)". */
export function BarberSelect({
  id,
  label,
  barbers,
  currentUserId,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  barbers: readonly BarberOption[];
  currentUserId: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name="barberId"
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  );
}
