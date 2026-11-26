"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { NETWORK_ERROR_MESSAGE, safeAction } from "@/lib/safe-action";
import { useToast } from "./toast";

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * Envío de una hoja: un solo envío a la vez (el `ref` corta el segundo toque antes de que React renderice),
 * sin reintentos, y con el error de red como un error más. Después de un éxito queda bloqueado hasta `reset`
 * (la hoja lo llama al terminar de cerrarse), para que un toque durante el cierre no vuelva a enviar.
 */
export function useSheetAction<S extends Result>({
  action,
  onNetworkError,
  onSuccess,
}: {
  action: (prev: S | null, formData: FormData) => Promise<S | null>;
  /** Estado de error con el mensaje de red, con la forma que espera la acción. */
  onNetworkError: (prev: S | null, error: string) => S;
  onSuccess: (message: string) => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<S | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  // `false` si la pantalla se ocultó o se desmontó (Next oculta las rutas, no las desmonta).
  const alive = useRef(false);

  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function submit(formData: FormData) {
    if (busy.current) return;
    busy.current = true;
    const run = safeAction(action, (prev) => onNetworkError(prev, NETWORK_ERROR_MESSAGE), unstable_rethrow);
    startTransition(async () => {
      const result = await run(state, formData);
      if (!alive.current) {
        // Salió de la pantalla con el envío en curso: la hoja ya no está, pero el resultado se avisa igual.
        // Nadie va a llamar a `reset`: el bloqueo se suelta acá.
        busy.current = false;
        if (result) toast(result.ok ? result.message : result.error);
        return;
      }
      if (!result?.ok) busy.current = false;
      startTransition(() => setState(result));
      if (result?.ok) onSuccess(result.message);
    });
  }

  function reset() {
    busy.current = false;
    setState(null);
  }

  return {
    submit,
    reset,
    /** Mientras guarda y, tras un éxito, hasta que la hoja termina de cerrarse. */
    locked: pending || state?.ok === true,
    error: !pending && state && !state.ok ? state.error : null,
  };
}
