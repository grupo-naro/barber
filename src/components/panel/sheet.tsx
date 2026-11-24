"use client";

import { useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { Drawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePanelPortal } from "./portal-context";

const WIDE_QUERY = "(min-width: 640px)";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/**
 * Hoja que sube desde abajo (hasta 92% del alto); desde 640 px, diálogo centrado sin gesto. Se cierra con ✕,
 * Escape, tocando afuera o deslizando. Con `locked` (mientras guarda) no se cierra por ningún camino.
 * El contenido se desmonta al terminar de cerrarse; el estado que tiene que sobrevivir vive en quien la abre.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  locked = false,
  footer,
  onClosed,
  returnFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  locked?: boolean;
  /** Acción principal: queda fija abajo, por encima del teclado. */
  footer?: ReactNode;
  /** Después de la animación de cierre, cuando la página ya no está tapada ni oculta a lectores de pantalla. */
  onClosed?: () => void;
  /** Quién la abrió, para devolverle el foco (se abre sin `Trigger`). */
  returnFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const container = usePanelPortal();
  const wide = useIsWide();
  const popup = useRef<HTMLDivElement>(null);

  return (
    <Drawer.Root
      open={open}
      swipeDirection="down"
      onOpenChange={(next, details) => {
        if (!next && locked) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed?.();
      }}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal container={container}>
          <Drawer.Backdrop className="fixed inset-0 z-50 bg-black opacity-[calc(0.55*(1-var(--drawer-swipe-progress)))] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0" />
          <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
            <Drawer.Popup
              ref={popup}
              initialFocus={popup}
              finalFocus={() => (returnFocus?.current?.isConnected ? returnFocus.current : true)}
              // En computadora no hay gesto, y mientras guarda tampoco: ni siquiera se mueve.
              data-base-ui-swipe-ignore={wide || locked ? "" : undefined}
              className={cn(
                "flex max-h-[calc(92dvh-var(--drawer-keyboard-inset,0px))] w-full flex-col rounded-t-[20px] bg-card text-card-foreground outline-none",
                "mb-[var(--drawer-keyboard-inset,0px)] [transform:translateY(var(--drawer-swipe-movement-y))]",
                "transition-[transform,opacity] duration-280 ease-[cubic-bezier(0.2,0.8,0.2,1)] data-swiping:duration-0 data-swiping:select-none",
                "data-ending-style:[transform:translateY(105%)] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*260ms)] data-starting-style:[transform:translateY(105%)]",
                "sm:max-h-[92dvh] sm:max-w-lg sm:rounded-2xl sm:[transform:none] sm:data-ending-style:opacity-0 sm:data-ending-style:[transform:scale(0.97)] sm:data-starting-style:opacity-0 sm:data-starting-style:[transform:scale(0.97)]",
              )}
            >
              <div className="flex shrink-0 touch-none items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
                <Drawer.Title className="panel-display line-clamp-2 min-w-0 py-0.5 text-[1.625rem] leading-[1.15] wrap-anywhere">
                  {title}
                </Drawer.Title>
                <Drawer.Close
                  aria-label="Cerrar"
                  disabled={locked}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary disabled:opacity-50"
                >
                  <X className="size-5" aria-hidden />
                </Drawer.Close>
              </div>
              <Drawer.Content className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-1 pb-4">
                {children}
              </Drawer.Content>
              {footer ? (
                <div className="shrink-0 border-t bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:rounded-b-2xl sm:pb-4">
                  {footer}
                </div>
              ) : (
                <div className="h-[env(safe-area-inset-bottom,0px)] shrink-0" />
              )}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}
