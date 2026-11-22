"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { updateBrandColors } from "@/server/actions/landing";
import type { ActionResult } from "@/lib/barbershop-settings";
import {
  BRAND_PRESETS,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  HEX_COLOR_RE,
  brandPalette,
  paletteVars,
} from "@/lib/brand-colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormStatus } from "./form-ui";

type Field = "primary" | "secondary";

const FIELDS: { field: Field; label: string; hint: string; fallback: string }[] = [
  { field: "primary", label: "Principal", hint: "Sección de horarios, sombras y franjas.", fallback: DEFAULT_PRIMARY },
  { field: "secondary", label: "Secundario", hint: "Botones, precios y el día de hoy.", fallback: DEFAULT_SECONDARY },
];

/** Hex válido en minúscula, o `null` si el texto todavía no es un color completo. */
function validHex(value: string): string | null {
  const v = value.trim();
  return HEX_COLOR_RE.test(v) ? v.toLowerCase() : null;
}

/** Colores de la landing: paletas, selector por color y vista previa con el contraste ya ajustado. */
export function BrandColorsForm({ primary, secondary }: { primary: string | null; secondary: string | null }) {
  const [state, action, pending] = useActionState<ActionResult | undefined, FormData>(updateBrandColors, undefined);
  const [values, setValues] = useState<Record<Field, string>>({
    primary: primary ?? DEFAULT_PRIMARY,
    secondary: secondary ?? DEFAULT_SECONDARY,
  });
  // Al guardar (o restablecer) el form muestra lo que guardó el servidor. Ajuste durante el render, sin useEffect.
  const [syncedState, setSyncedState] = useState(state);
  if (state !== syncedState) {
    setSyncedState(state);
    if (state?.ok && state.values) {
      setValues({
        primary: state.values.primary || DEFAULT_PRIMARY,
        secondary: state.values.secondary || DEFAULT_SECONDARY,
      });
    }
  }
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Mientras se escribe un hex incompleto, la vista previa usa el original de ese campo.
  const effective: Record<Field, string> = {
    primary: validHex(values.primary) ?? DEFAULT_PRIMARY,
    secondary: validHex(values.secondary) ?? DEFAULT_SECONDARY,
  };
  const palette = brandPalette(effective.primary, effective.secondary);
  const adjusted = palette.adjusted.primary || palette.adjusted.secondary;
  const set = (field: Field, value: string) => setValues((v) => ({ ...v, [field]: value }));

  return (
    <form action={action} className="flex flex-col gap-5" noValidate aria-labelledby="landing-colors-title">
      <div>
        <h3 id="landing-colors-title" className="font-medium">
          Colores
        </h3>
        <p className="text-sm text-muted-foreground">
          Cambiá el azul y el rojo de tu página por los de tu marca. El diseño queda igual.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Paletas</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BRAND_PRESETS.map((preset) => {
            const active = effective.primary === preset.primary && effective.secondary === preset.secondary;
            return (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                size="lg"
                className="h-auto min-h-11 justify-start gap-2 px-2.5 py-1.5 text-left whitespace-normal"
                aria-pressed={active}
                onClick={() => setValues({ primary: preset.primary, secondary: preset.secondary })}
              >
                <span aria-hidden className="flex shrink-0 overflow-hidden rounded-sm ring-1 ring-foreground/20">
                  <span className="size-5" style={{ backgroundColor: preset.primary }} />
                  <span className="size-5" style={{ backgroundColor: preset.secondary }} />
                </span>
                <span className="min-w-0 leading-tight">{preset.name}</span>
                {active ? <Check aria-hidden className="ml-auto" /> : null}
              </Button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ field, label, hint, fallback }) => (
          <div key={field} className="flex flex-col gap-2">
            <Label htmlFor={`brand-${field}`}>{label}</Label>
            <div className="flex gap-2">
              <Label htmlFor={`brand-${field}-picker`} className="sr-only">
                {`${label} (selector de color)`}
              </Label>
              <input
                id={`brand-${field}-picker`}
                type="color"
                value={validHex(values[field]) ?? fallback}
                onChange={(e) => set(field, e.target.value)}
                className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1"
                aria-describedby={`brand-${field}-help`}
              />
              <Input
                id={`brand-${field}`}
                name={field}
                value={values[field]}
                onChange={(e) => set(field, e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={7}
                placeholder={fallback}
                className="h-11 min-w-0 flex-1 font-mono"
                aria-invalid={errors[field] ? true : undefined}
                aria-describedby={`brand-${field}-help${errors[field] ? ` brand-${field}-error` : ""}`}
              />
            </div>
            <p id={`brand-${field}-help`} className="text-xs text-muted-foreground">
              {hint} Formato #rrggbb.
            </p>
            <FieldError id={`brand-${field}-error`} message={errors[field]} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium" id="brand-preview-title">
          Vista previa
        </p>
        <BrandPreview style={paletteVars(palette) as CSSProperties} />
        {adjusted ? (
          <p className="text-sm text-muted-foreground" role="note">
            Ajustamos un poco el tono para que se lea bien
            {palette.adjusted.primary ? ` (principal: ${palette.royal})` : ""}
            {palette.adjusted.secondary ? ` (secundario: ${palette.rojo})` : ""}.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="submit" size="lg" className="h-11 px-4" disabled={pending}>
          {pending ? "Guardando…" : "Guardar colores"}
        </Button>
        <Button type="submit" name="reset" value="1" variant="outline" size="lg" className="h-11 px-4" disabled={pending}>
          Restablecer colores originales
        </Button>
        <FormStatus state={state} pending={pending} />
      </div>
    </form>
  );
}

/**
 * Mini mock de la landing con la paleta ajustada (mismos valores que va a usar `/[slug]`): título con
 * la sombra del principal, botón sticker, tag de precio, franja del poste y la sección de horarios.
 * Decorativa: los colores vienen solo de `brandPalette` como custom properties.
 */
function BrandPreview({ style }: { style: CSSProperties }) {
  return (
    <div
      aria-labelledby="brand-preview-title"
      role="img"
      style={style}
      className="overflow-hidden rounded-xl border-[3px] border-black bg-black text-white"
    >
      <div className="flex flex-col gap-3 p-4">
        <p className="text-3xl leading-none font-black tracking-tight uppercase [text-shadow:0.06em_0.06em_0_var(--royal)]">
          Tu barbería
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-10 items-center rounded border-[3px] border-black bg-[var(--rojo)] px-3 text-sm font-bold tracking-wide uppercase shadow-[4px_4px_0_#fff]">
            Reservar turno
          </span>
          <span className="text-sm font-medium text-[var(--rojo-claro)] underline underline-offset-4">Reservá online</span>
        </div>
      </div>
      <div
        className="h-4 border-y-[3px] border-black"
        style={{
          background:
            "repeating-linear-gradient(-45deg, var(--royal) 0 14px, #fff 14px 22px, var(--rojo) 22px 36px, #fff 36px 44px)",
        }}
      />
      <div className="flex items-center justify-between gap-3 bg-white p-4 text-black">
        <span className="text-sm font-bold uppercase">Corte de pelo</span>
        <span className="shrink-0 rounded-sm bg-[var(--rojo)] px-2 py-0.5 text-sm font-bold text-white">$ 15.000</span>
      </div>
      <div className="flex flex-col gap-1 bg-[var(--royal)] p-4">
        <span className="text-sm font-bold uppercase">Horarios</span>
        <span className="text-sm text-[var(--royal-muted)]">Lunes a sábado</span>
        <span className="mt-1 rounded-sm bg-[var(--rojo)] px-2 py-1 text-sm font-medium">Hoy · 10:00 a 20:00</span>
      </div>
    </div>
  );
}
