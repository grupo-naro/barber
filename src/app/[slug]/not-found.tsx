import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { displayFont, scriptTag, stickerButton } from "./ui";

export default function BarbershopNotFound() {
  return (
    <main className="landing-grain flex flex-1 flex-col">
      <div aria-hidden className="landing-pole landing-pole-spin h-8 border-b-[3px] border-black" />
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-5 px-5 py-16">
        <p className="flex items-end gap-3">
          <span className={cn(displayFont, "text-8xl leading-none [text-shadow:0.05em_0.05em_0_var(--royal)]")}>
            <span className="sr-only">Error </span>404
          </span>
          <span aria-hidden className={cn(scriptTag, "mb-2 -rotate-6 text-3xl")}>
            Uy
          </span>
        </p>
        <h1 className={cn(displayFont, "text-5xl leading-[0.95]")}>Barbería no encontrada</h1>
        <p className="text-lg text-muted-foreground">
          No hay ninguna barbería con esta dirección. Revisá que el link esté bien escrito.
        </p>
        <Link
          href="/"
          className={buttonVariants({
            variant: "outline",
            className: cn(stickerButton, "mt-2 bg-white text-black [--sticker-shadow:var(--rojo)] hover:bg-white hover:text-black dark:bg-white dark:hover:bg-white"),
          })}
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
