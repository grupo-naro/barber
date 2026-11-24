"use client";

import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  adjustmentError,
  calculateNewPriceCents,
  centsToPrice,
  exceedsMaxPrice,
  priceToCents,
  type PriceMode,
  type Rounding,
} from "@/lib/pricing";
import { applyBulkPriceUpdate, type BulkPriceState } from "@/server/actions/services";
import { nativeControlClass } from "./format";

type BulkService = { id: string; name: string; price: string };
type Direction = "up" | "down";
type Scope = "all" | "selected";

const chipClass =
  "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50";

function Choice<T extends string>({
  name,
  value,
  current,
  onChange,
  children,
}: {
  name: string;
  value: T;
  current: T;
  onChange: (value: T) => void;
  children: React.ReactNode;
}) {
  return (
    <label className={chipClass}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      {children}
    </label>
  );
}

export function BulkPriceForm({ services }: { services: BulkService[] }) {
  const [state, action, pending] = useActionState<BulkPriceState, FormData>(applyBulkPriceUpdate, null);
  const [mode, setMode] = useState<PriceMode>("percent");
  const [direction, setDirection] = useState<Direction>("up");
  const [amount, setAmount] = useState("");
  const [rounding, setRounding] = useState<Rounding>("none");
  const [scope, setScope] = useState<Scope>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [handledNonce, setHandledNonce] = useState<number | null>(null);

  // Al terminar un envío exitoso se vuelve al primer paso con el valor limpio.
  if (state && state.nonce !== handledNonce) {
    setHandledNonce(state.nonce);
    if (state.ok) {
      setStep("edit");
      setAmount("");
    }
  }

  const trimmed = amount.trim();
  const value = direction === "down" && trimmed !== "" ? `-${trimmed}` : trimmed;
  const valueError = trimmed === "" ? null : adjustmentError(mode, value);
  const targets = scope === "all" ? services : services.filter((s) => selected.has(s.id));
  const preview =
    trimmed !== "" && !valueError
      ? targets.map((s) => {
          const cents = calculateNewPriceCents(s.price, mode, value, rounding);
          return { ...s, next: centsToPrice(cents), changed: cents !== priceToCents(s.price), tooBig: exceedsMaxPrice(cents) };
        })
      : [];
  const changes = preview.filter((p) => p.changed).length;
  const tooBig = preview.some((p) => p.tooBig);
  const canReview = preview.length > 0;

  function toggleSelected(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (services.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay servicios activos para actualizar.</p>;
  }

  const locked = step === "review";

  return (
    <div className="flex flex-col gap-4">
      <fieldset disabled={locked} className="flex flex-col gap-4 disabled:opacity-60">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Tipo de ajuste</span>
          <div className="flex gap-2">
            <Choice name="bulk-mode" value="percent" current={mode} onChange={setMode}>
              Porcentaje (%)
            </Choice>
            <Choice name="bulk-mode" value="fixed" current={mode} onChange={setMode}>
              Monto fijo ($)
            </Choice>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Dirección</span>
          <div className="flex gap-2">
            <Choice name="bulk-direction" value="up" current={direction} onChange={setDirection}>
              Subir
            </Choice>
            <Choice name="bulk-direction" value="down" current={direction} onChange={setDirection}>
              Bajar
            </Choice>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bulk-amount">{mode === "percent" ? "Porcentaje" : "Monto ($)"}</Label>
            <Input
              id="bulk-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder={mode === "percent" ? "10" : "1500"}
              aria-invalid={valueError ? true : undefined}
              aria-describedby={valueError ? "bulk-amount-error" : undefined}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bulk-rounding">Redondeo</Label>
            <select
              id="bulk-rounding"
              value={rounding}
              onChange={(e) => setRounding(e.target.value as Rounding)}
              className={nativeControlClass}
            >
              <option value="none">Sin redondeo</option>
              <option value="500">A $500</option>
              <option value="1000">A $1000</option>
            </select>
          </div>
        </div>
        {valueError ? (
          <p id="bulk-amount-error" className="-mt-2 text-sm text-destructive">
            {valueError}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Aplicar a</span>
          <div className="flex gap-2">
            <Choice name="bulk-scope" value="all" current={scope} onChange={setScope}>
              Todos los activos
            </Choice>
            <Choice name="bulk-scope" value="selected" current={scope} onChange={setScope}>
              Elegir servicios
            </Choice>
          </div>
          {scope === "selected" ? (
            <ul className="flex flex-col gap-1">
              {services.map((s) => (
                <li key={s.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(e) => toggleSelected(s.id, e.target.checked)}
                      className="size-5 accent-primary"
                    />
                    <span className="flex-1">{s.name}</span>
                    <span className="text-muted-foreground tabular-nums">{formatPrice(s.price)}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </fieldset>

      {step === "edit" ? (
        <Button
          type="button"
          size="lg"
          className="h-11"
          disabled={!canReview}
          onClick={() => setStep("review")}
        >
          Ver vista previa
        </Button>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="value" value={value} />
          <input type="hidden" name="rounding" value={rounding} />
          <input type="hidden" name="scope" value={scope} />
          {scope === "selected"
            ? targets.map((s) => <input key={s.id} type="hidden" name="serviceIds" value={s.id} />)
            : null}

          <h3 className="text-sm font-semibold">Vista previa</h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {preview.map((p) => {
              const { changed } = p;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    <span className="text-muted-foreground">{formatPrice(p.price)}</span>
                    <ArrowRight className="size-4 text-muted-foreground" aria-label="pasa a" />
                    <span
                      className={cn(
                        changed ? "font-semibold" : "text-muted-foreground",
                        p.tooBig && "text-destructive",
                      )}
                    >
                      {formatPrice(p.next)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {tooBig ? (
            <p role="alert" className="text-sm text-destructive">
              Algún precio nuevo supera el máximo permitido. Probá con un ajuste menor.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {changes === 0
              ? "Con este ajuste ningún precio cambia."
              : changes === 1
                ? "Va a cambiar el precio de 1 servicio."
                : `Va a cambiar el precio de ${changes} servicios.`}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11"
              disabled={pending}
              onClick={() => setStep("edit")}
            >
              Volver
            </Button>
            <Button type="submit" size="lg" className="h-11" disabled={pending || changes === 0 || tooBig}>
              {pending ? "Aplicando…" : "Confirmar y aplicar"}
            </Button>
          </div>
        </form>
      )}

      {state?.ok ? (
        <p role="status" className="text-sm font-medium">
          {state.message}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
