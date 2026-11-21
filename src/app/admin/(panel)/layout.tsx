import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, Shield } from "lucide-react";
import { requireAdminSession } from "@/lib/admin-auth";
import { adminLogout } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Administración — Barber",
  robots: { index: false, follow: false },
};

async function AdminIdentity() {
  // El layout no protege las páginas: cada página llama además a `requireAdminSession()`.
  const { admin } = await requireAdminSession();
  return (
    <div className="flex items-center gap-3">
      <span className="hidden truncate text-sm text-muted-foreground sm:inline">{admin.email}</span>
      <form action={adminLogout}>
        <Button type="submit" variant="outline" size="sm">
          <LogOut aria-hidden />
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}

export default function AdminPanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <Shield className="size-4" aria-hidden />
            Barber · Admin
          </Link>
          <Link href="/admin" className="text-muted-foreground hover:text-foreground">
            Barberías
          </Link>
          <Link href="/admin/barbershops/new" className="text-muted-foreground hover:text-foreground">
            Nueva barbería
          </Link>
        </nav>
        <Suspense fallback={<div className="h-8 w-32" aria-busy="true" />}>
          <AdminIdentity />
        </Suspense>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6">{children}</main>
    </div>
  );
}
