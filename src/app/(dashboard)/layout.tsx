import { Suspense } from "react";
import Link from "next/link";
import { CircleUser, LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { logout } from "@/server/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DashboardNav } from "@/components/dashboard-nav";
import { navItemsForRole } from "@/lib/dashboard-nav";
import { planBanner, planBannerMessage } from "@/lib/platform-admin";
import { cn } from "@/lib/utils";

const roleLabel = { OWNER: "Dueño/a", BARBER: "Barbero/a" } as const;

async function SessionHeader() {
  const session = await requireSession();
  // Aviso del plan solo para el dueño, con la fecha en la timezone de la barbería. No bloquea nada.
  const banner =
    session.role === "OWNER"
      ? planBanner(session.barbershop.planExpiresAt, new Date(), session.barbershop.timezone)
      : ({ kind: "none" } as const);
  const bannerMessage = planBannerMessage(banner);
  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{session.barbershop.name}</p>
          <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
            {session.user.name}
            <Badge variant="secondary">{roleLabel[session.role]}</Badge>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard/account"
            aria-label="Mi cuenta"
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-11 min-w-11")}
          >
            <CircleUser aria-hidden />
            <span className="max-sm:sr-only">Mi cuenta</span>
          </Link>
          <form action={logout}>
            <Button type="submit" variant="outline" size="lg" className="h-11 min-w-11" aria-label="Cerrar sesión">
              <LogOut />
              <span className="max-sm:sr-only">Cerrar sesión</span>
            </Button>
          </form>
        </div>
      </header>
      {bannerMessage ? (
        <p
          role="status"
          className={cn(
            "border-b px-4 py-2 text-center text-sm",
            banner.kind === "expired" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
          )}
        >
          {bannerMessage}
        </p>
      ) : null}
      {/* El filtrado por rol se hace acá, en el servidor, con el rol de la sesión. */}
      <DashboardNav items={navItemsForRole(session.role)} />
    </>
  );
}

function HeaderFallback() {
  return (
    <>
      <header className="h-17.25 border-b bg-background" aria-busy="true" />
      <div
        className="fixed inset-x-0 bottom-0 h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t bg-background sm:static sm:h-13.25 sm:border-t-0 sm:border-b"
        aria-hidden="true"
      />
    </>
  );
}

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <Suspense fallback={<HeaderFallback />}>
        <SessionHeader />
      </Suspense>
      {/* En mobile el nav es una barra fija abajo: el padding inferior evita que tape el último elemento. */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-6 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1.5rem)] sm:pb-6">
        {children}
      </main>
    </div>
  );
}
