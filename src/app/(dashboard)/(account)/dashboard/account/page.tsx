import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PanelBody, PanelHeader } from "@/components/panel/panel-header";
import { AccountSkeleton } from "@/components/panel/skeletons";
import { requireSession } from "@/lib/auth";
import { logout } from "@/server/actions/auth";
import { PasswordForm } from "./password-form";

const roleLabel = { OWNER: "Dueño/a", BARBER: "Barbero/a" } as const;

export const metadata: Metadata = { title: "Mi cuenta — Barber" };

async function Account() {
  const session = await requireSession();
  return (
    <>
      <PanelHeader title="Mi cuenta" context={session.barbershop.name} />
      <PanelBody>
        <div className="flex flex-col gap-0.5">
          <p className="wrap-anywhere">
            <span className="font-semibold">{session.user.name}</span> · {roleLabel[session.role]}
          </p>
          <p className="text-sm break-all text-muted-foreground">{session.user.email}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Cambiar mi contraseña</h2>
            </CardTitle>
            <CardDescription>Para cambiarla, primero confirmá la que usás hoy.</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
        <form action={logout}>
          <Button type="submit" variant="outline" size="lg" className="h-12 w-full text-base font-semibold">
            Cerrar sesión
          </Button>
        </form>
      </PanelBody>
    </>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Account />
    </Suspense>
  );
}
