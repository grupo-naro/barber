"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const TOAST_MS = 3000;

const ToastContext = createContext<(message: string) => void>(() => {});

/**
 * Avisos del panel: una región `role="status"` siempre montada, dentro de `.panel-theme`, encima de la barra y del
 * botón fijo de Hoy, y debajo de las hojas. Con una hoja abierta los lectores de pantalla no la leen: emitir en `onClosed`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const show = useCallback((message: string) => {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, message }));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        data-panel-toast=""
        className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--panel-bar)+5.5rem)] z-45 flex justify-center"
      >
        {toast ? (
          <p
            key={toast.id}
            className="max-w-full animate-in rounded-xl bg-(--panel-header) px-4 py-3 text-center font-medium wrap-anywhere text-(--panel-header-foreground) shadow-lg duration-200 fade-in slide-in-from-bottom-2"
          >
            {toast.message}
          </p>
        ) : null}
      </div>
    </ToastContext>
  );
}

/** Muestra un aviso de 3 segundos. Solo para lo que el servidor ya confirmó (o para avisar un cambio). */
export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}
