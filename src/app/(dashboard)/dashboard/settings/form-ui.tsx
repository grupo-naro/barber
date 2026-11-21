import type { ActionResult } from "@/lib/barbershop-settings";

/** Clases de los controles nativos (select, textarea, checkbox) alineadas con `<Input>`, solo tokens de tema. */
export const nativeFieldClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30";

export const checkboxClass = "size-5 shrink-0 cursor-pointer accent-primary";

/** Mensaje de error de un campo, enlazado con `aria-describedby`. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** Región `aria-live` siempre montada para que el lector de pantalla anuncie el resultado. */
export function FormStatus({ state, pending }: { state: ActionResult | undefined; pending: boolean }) {
  const message = pending ? "" : state ? (state.ok ? (state.message ?? "Guardado.") : state.error) : "";
  return (
    <p
      aria-live="polite"
      role="status"
      className={state && !state.ok ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
    >
      {message}
    </p>
  );
}
