// Controles compartidos por las hojas de Hoy y la ficha del cliente (se usan desde componentes de cliente).
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/money";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethodValue } from "@/lib/records";
import { cn } from "@/lib/utils";
import type { BarberOption, ServiceOption } from "@/server/queries/records";
import { nativeControlClass } from "./format";

const focusWithin = "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring";

/** Servicios en dos columnas, con nombre (hasta dos líneas) y precio. Se pueden marcar varios. */
export function ServiceTiles({
  services,
  selected,
  onToggle,
  disabled,
}: {
  services: readonly ServiceOption[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">Servicios</legend>
      {services.length === 0 ? (
        <p className="text-muted-foreground">No hay servicios activos. Cargalos en Servicios.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {services.map((service) => {
            const checked = selected.includes(service.id);
            return (
              <label
                key={service.id}
                className={cn(
                  "relative flex min-h-15 cursor-pointer flex-col justify-center rounded-[10px] border-2 px-2.5 py-2 leading-tight select-none has-disabled:cursor-not-allowed",
                  checked ? "border-(--brand) bg-(--brand) text-primary-foreground" : "bg-card",
                  focusWithin,
                )}
              >
                <input
                  type="checkbox"
                  name="serviceIds"
                  value={service.id}
                  checked={checked}
                  onChange={() => onToggle(service.id)}
                  className="sr-only"
                />
                <span className="line-clamp-2 wrap-anywhere">{service.name}</span>
                <span className={cn("text-[0.9375rem] wrap-anywhere tabular-nums", !checked && "text-muted-foreground")}>
                  {formatPrice(service.price)}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

const SHORT_LABELS: Record<PaymentMethodValue, string> = { ...PAYMENT_METHOD_LABELS, TRANSFER: "Transf." };

/** Los cuatro medios de pago en una fila. */
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
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">Medio de pago</legend>
      <div className="grid grid-cols-4 gap-1 rounded-[10px] bg-secondary p-1">
        {PAYMENT_METHODS.map((method) => (
          <label
            key={method}
            className={cn(
              "relative flex min-h-11 cursor-pointer items-center justify-center rounded-[7px] text-[0.9375rem] select-none has-disabled:cursor-not-allowed",
              value === method && "bg-card font-bold text-(--brand) ring-2 ring-(--brand)",
              focusWithin,
            )}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={method}
              aria-label={PAYMENT_METHOD_LABELS[method]}
              checked={value === method}
              onChange={() => onChange(method)}
              className="sr-only"
            />
            {SHORT_LABELS[method]}
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

/** Error de una hoja, arriba de su botón. */
export function SheetError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mb-2.5 font-medium wrap-anywhere text-destructive">
      {message}
    </p>
  ) : null;
}

/** Alterna un id en una lista (para los servicios). */
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-base">
        {label}
      </Label>
      <select
        id={id}
        name="barberId"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(nativeControlClass, "min-h-12 rounded-[10px] border-2 md:text-base")}
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

/** Barbero elegido si sigue en la lista; si no, quien usa el panel. */
export function pickBarber(barbers: readonly BarberOption[] | null, wanted: string | null, currentUserId: string): string {
  return wanted && barbers?.some((b) => b.id === wanted) ? wanted : currentUserId;
}
