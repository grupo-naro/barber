import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { INVALID_INVITATION_MESSAGE } from "@/lib/invitations";
import { getUsableInvitation } from "@/server/queries/barbers";
import { AcceptInvitationForm } from "./accept-form";

// El token viaja en la URL: la página no se indexa, no manda referrer y no carga recursos de terceros.
export const metadata: Metadata = {
  title: "Invitación — Barber",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function InvalidInvitation() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Link no válido</CardTitle>
        <CardDescription role="alert">{INVALID_INVITATION_MESSAGE}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 w-full" })}>
          Ir a ingresar
        </Link>
      </CardContent>
    </Card>
  );
}

async function Invitation({ params }: { params: PageProps<"/invitacion/[token]">["params"] }) {
  const { token } = await params;
  await connection(); // vigencia y uso de la invitación: siempre por request, nunca prerenderizado
  const invitation = await getUsableInvitation(token);
  if (!invitation) return <InvalidInvitation />;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Sumate a {invitation.barbershopName}</CardTitle>
        <CardDescription>
          Hola, {invitation.userName}. Elegí una contraseña para entrar al panel de la barbería.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInvitationForm token={token} />
      </CardContent>
    </Card>
  );
}

export default function InvitationPage({ params }: PageProps<"/invitacion/[token]">) {
  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <Suspense fallback={<div className="h-80 w-full max-w-sm animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <Invitation params={params} />
      </Suspense>
    </main>
  );
}
