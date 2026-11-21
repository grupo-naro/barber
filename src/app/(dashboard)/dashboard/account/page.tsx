import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Mi cuenta — Barber" };

async function Account() {
  const session = await requireSession();
  return (
    <>
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{session.user.name}</span> · {session.barbershop.name}
        </p>
        <p className="break-all">{session.user.email}</p>
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
    </>
  );
}

export default function AccountPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <Account />
      </Suspense>
    </>
  );
}
