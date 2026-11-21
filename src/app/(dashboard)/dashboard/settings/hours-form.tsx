"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { updateOpeningHours } from "@/server/actions/barbershop";
import {
  MAX_RANGES_PER_DAY,
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_LABELS,
  type ActionResult,
  type DayHoursData,
} from "@/lib/barbershop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus } from "./form-ui";

type RangeState = { opensAt: string; closesAt: string };
type DayState = { closed: boolean; ranges: RangeState[] };

/** Franja con la que arranca un día que se abre sin horas cargadas. */
const DEFAULT_RANGE: RangeState = { opensAt: "10:00", closesAt: "20:00" };
/** Turno tarde sugerido al agregar la segunda franja (si no se pisa con la primera). */
const AFTERNOON_RANGE: RangeState = { opensAt: "17:00", closesAt: "21:00" };

export function HoursForm({ hours }: { hours: DayHoursData[] }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    updateOpeningHours,
    undefined,
  );
  const [days, setDays] = useState<Record<number, DayState>>(() =>
    Object.fromEntries(
      hours.map((d) => [d.weekday, { closed: d.closed, ranges: d.ranges.map((r) => ({ ...r })) }]),
    ),
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const update = (weekday: number, fn: (day: DayState) => DayState) =>
    setDays((prev) => ({ ...prev, [weekday]: fn(prev[weekday] ?? { closed: true, ranges: [] }) }));

  const setOpen = (weekday: number, open: boolean) =>
    update(weekday, (day) => ({
      closed: !open,
      ranges: open && day.ranges.length === 0 ? [{ ...DEFAULT_RANGE }] : day.ranges,
    }));

  const setRange = (weekday: number, index: number, patch: Partial<RangeState>) =>
    update(weekday, (day) => ({
      ...day,
      ranges: day.ranges.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));

  const addRange = (weekday: number) =>
    update(weekday, (day) => {
      const first = day.ranges[0];
      const suggested =
        first && first.closesAt && first.closesAt <= AFTERNOON_RANGE.opensAt
          ? { ...AFTERNOON_RANGE }
          : { opensAt: "", closesAt: "" };
      return { ...day, ranges: [...day.ranges, suggested].slice(0, MAX_RANGES_PER_DAY) };
    });

  const removeRange = (weekday: number, index: number) =>
    update(weekday, (day) => ({ ...day, ranges: day.ranges.filter((_, i) => i !== index) }));

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <ul className="flex flex-col divide-y divide-border">
        {WEEKDAY_DISPLAY_ORDER.map((weekday) => {
          const day = days[weekday] ?? { closed: true, ranges: [] };
          const label = WEEKDAY_LABELS[weekday];
          const error = errors[String(weekday)];
          const errorId = `hours-${weekday}-error`;
          const isOpen = !day.closed;
          return (
            <li key={weekday} className="py-3 first:pt-0 last:pb-0">
              <fieldset className="flex flex-col gap-2" aria-describedby={error ? errorId : undefined}>
                <legend className="sr-only">{label}</legend>
                <div className="flex items-center justify-between gap-3">
                  <span aria-hidden className="font-medium">
                    {label}
                  </span>
                  <label
                    htmlFor={`open-${weekday}`}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted-foreground"
                  >
                    <span className="w-14 text-right">{isOpen ? "Abierto" : "Cerrado"}</span>
                    <span className="relative inline-flex shrink-0">
                      <input
                        id={`open-${weekday}`}
                        name={`open-${weekday}`}
                        type="checkbox"
                        role="switch"
                        aria-label={`${label} abierto`}
                        checked={isOpen}
                        onChange={(e) => setOpen(weekday, e.target.checked)}
                        className="peer absolute inset-0 size-full cursor-pointer opacity-0"
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none h-7 w-12 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute top-1 left-1 size-5 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5"
                      />
                    </span>
                  </label>
                </div>

                {isOpen ? (
                  <div className="flex flex-col gap-2">
                    {day.ranges.map((range, index) => {
                      const which = index === 0 ? "Turno mañana" : "Turno tarde";
                      const single = day.ranges.length === 1;
                      return (
                        <div key={index} className="flex items-end gap-2">
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <Label
                              htmlFor={`opensAt-${weekday}-${index}`}
                              className="text-xs text-muted-foreground"
                            >
                              {single ? "Abre" : `${which}: abre`}
                            </Label>
                            <Input
                              id={`opensAt-${weekday}-${index}`}
                              name={`opensAt-${weekday}-${index}`}
                              type="time"
                              step={900}
                              value={range.opensAt}
                              onChange={(e) => setRange(weekday, index, { opensAt: e.target.value })}
                              aria-invalid={error ? true : undefined}
                              className="h-11"
                            />
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <Label
                              htmlFor={`closesAt-${weekday}-${index}`}
                              className="text-xs text-muted-foreground"
                            >
                              Cierra
                            </Label>
                            <Input
                              id={`closesAt-${weekday}-${index}`}
                              name={`closesAt-${weekday}-${index}`}
                              type="time"
                              step={900}
                              value={range.closesAt}
                              onChange={(e) => setRange(weekday, index, { closesAt: e.target.value })}
                              aria-invalid={error ? true : undefined}
                              className="h-11"
                            />
                          </div>
                          {index > 0 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="size-11 shrink-0"
                              aria-label={`Quitar turno tarde del ${label.toLowerCase()}`}
                              onClick={() => removeRange(weekday, index)}
                            >
                              <X aria-hidden />
                            </Button>
                          ) : (
                            // Mantiene alineadas las columnas con la fila que tiene botón de quitar.
                            !single && <span aria-hidden className="size-11 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                    {day.ranges.length === 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 self-start px-3"
                        onClick={() => addRange(weekday)}
                      >
                        <Plus aria-hidden />
                        Agregar turno tarde
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>
              <FieldError id={errorId} message={error ? `${label}: ${error}` : undefined} />
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" className="h-11 px-4" disabled={pending}>
          {pending ? "Guardando…" : "Guardar horarios"}
        </Button>
        <FormStatus state={state} pending={pending} />
      </div>
    </form>
  );
}
