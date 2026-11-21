"use client";

import { useActionState, useState } from "react";
import { updateOpeningHours } from "@/server/actions/barbershop";
import {
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_LABELS,
  type ActionResult,
  type DayHoursData,
} from "@/lib/barbershop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus, checkboxClass } from "./form-ui";

type DayState = { closed: boolean; opensAt: string; closesAt: string };

export function HoursForm({ hours }: { hours: DayHoursData[] }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(
    updateOpeningHours,
    undefined,
  );
  const [days, setDays] = useState<Record<number, DayState>>(() =>
    Object.fromEntries(
      hours.map((d) => [
        d.weekday,
        { closed: d.closed, opensAt: d.opensAt ?? "", closesAt: d.closesAt ?? "" },
      ]),
    ),
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  const update = (weekday: number, patch: Partial<DayState>) =>
    setDays((prev) => ({ ...prev, [weekday]: { ...prev[weekday], ...patch } }));

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <ul className="flex flex-col divide-y divide-border">
        {WEEKDAY_DISPLAY_ORDER.map((weekday) => {
          const day = days[weekday] ?? { closed: true, opensAt: "", closesAt: "" };
          const label = WEEKDAY_LABELS[weekday];
          const error = errors[String(weekday)];
          const errorId = `hours-${weekday}-error`;
          return (
            <li key={weekday} className="py-3 first:pt-0 last:pb-0">
              <fieldset
                className="grid grid-cols-2 items-center gap-x-3 gap-y-2 sm:grid-cols-[7rem_auto_1fr_1fr]"
                aria-describedby={error ? errorId : undefined}
              >
                <legend className="sr-only">{label}</legend>
                <span aria-hidden className="font-medium">
                  {label}
                </span>
                <label
                  htmlFor={`closed-${weekday}`}
                  className="flex min-h-11 cursor-pointer items-center justify-end gap-2 text-sm sm:justify-start"
                >
                  <input
                    id={`closed-${weekday}`}
                    name={`closed-${weekday}`}
                    type="checkbox"
                    checked={day.closed}
                    onChange={(e) => update(weekday, { closed: e.target.checked })}
                    className={checkboxClass}
                  />
                  Cerrado
                </label>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`opensAt-${weekday}`} className="text-xs text-muted-foreground">
                    Abre
                  </Label>
                  <Input
                    id={`opensAt-${weekday}`}
                    name={`opensAt-${weekday}`}
                    type="time"
                    step={900}
                    value={day.opensAt}
                    onChange={(e) => update(weekday, { opensAt: e.target.value })}
                    disabled={day.closed}
                    aria-invalid={error ? true : undefined}
                    className="h-11"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`closesAt-${weekday}`} className="text-xs text-muted-foreground">
                    Cierra
                  </Label>
                  <Input
                    id={`closesAt-${weekday}`}
                    name={`closesAt-${weekday}`}
                    type="time"
                    step={900}
                    value={day.closesAt}
                    onChange={(e) => update(weekday, { closesAt: e.target.value })}
                    disabled={day.closed}
                    aria-invalid={error ? true : undefined}
                    className="h-11"
                  />
                </div>
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
