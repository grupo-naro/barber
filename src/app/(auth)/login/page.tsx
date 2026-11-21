import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EXPIRED_MESSAGE, INACTIVE_MESSAGE } from "@/lib/auth";
import { SUSPENDED_MESSAGE } from "@/lib/platform-admin";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar — Barber" };

async function LoginFormWithNext({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next, suspended, inactive, expired } = await searchParams;
  // Los pone `requireSession` (rutas constantes) cuando el JWT es válido pero la DB rechaza la sesión.
  // Un solo aviso, con prioridad suspended > inactive > expired.
  const notice =
    suspended === "1" ? SUSPENDED_MESSAGE : inactive === "1" ? INACTIVE_MESSAGE : expired === "1" ? EXPIRED_MESSAGE : null;
  return (
    <>
      {notice ? (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {notice}
        </p>
      ) : null}
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Ingresá a tu barbería</CardTitle>
          <CardDescription>Usá el email y la contraseña de tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<LoginForm />}>
            <LoginFormWithNext searchParams={searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
