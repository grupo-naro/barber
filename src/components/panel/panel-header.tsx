import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Botón blanco del encabezado ("Mi cuenta"). */
export const headerActionClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-(--panel-header-foreground) px-3.5 text-base font-semibold text-(--panel-header)";

/**
 * Encabezado de cada pantalla del panel: franja negra a todo el ancho, título en Anton y una línea de contexto.
 * Es el único `h1` de la pantalla. Sirve en Server y Client Components.
 */
export function PanelHeader({
  title,
  context,
  backHref,
  action,
}: {
  title: ReactNode;
  context?: ReactNode;
  /** Enlace "Volver" de las fichas a su lista. */
  backHref?: string;
  action?: ReactNode;
}) {
  return (
    <header className="panel-header bg-(--panel-header) pt-(--panel-safe-top) text-(--panel-header-foreground)">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4.5 sm:px-4">
        {backHref ? (
          <Link
            href={backHref}
            className="-ml-1.5 inline-flex min-h-11 w-fit items-center gap-1 pr-2 text-base font-medium text-(--panel-header-muted) hover:text-(--panel-header-foreground)"
          >
            <ChevronLeft className="size-5" aria-hidden />
            Volver
          </Link>
        ) : null}
        <div className={cn("flex items-end justify-between gap-3 pb-4", backHref ? "pt-1" : "min-h-24 pt-5")}>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="panel-display text-[2rem] leading-[1.12] wrap-anywhere">{title}</h1>
            {context ? (
              <p className="min-h-[1.4em] text-[0.9375rem] leading-[1.4] wrap-anywhere text-(--panel-header-muted)">
                {context}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      </div>
    </header>
  );
}

/** Contenido de una pantalla, con el ancho de siempre y lugar para la barra de abajo. */
export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-5 pb-[calc(var(--panel-bar)+1.5rem)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
