import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
      <p className="text-sm font-medium text-muted-foreground">Error 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="text-muted-foreground">
        La dirección no existe o la barbería ya no está disponible. Revisá que el link esté bien escrito.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Ir al inicio
      </Link>
    </main>
  );
}
