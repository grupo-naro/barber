import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminSession } from "@/lib/admin-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateBarbershopForm } from "./create-form";

async function NewBarbershop() {
  await requireAdminSession();
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg font-semibold">Nueva barbería</h1>
        </CardTitle>
        <CardDescription>
          Se crea activa, con plan Gratis y horario de lunes a sábado de 10 a 20. Al dueño le generamos un link para
          que elija su contraseña.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CreateBarbershopForm />
      </CardContent>
    </Card>
  );
}

export default function NewBarbershopPage() {
  return (
    <>
      <Link href="/admin" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Volver a barberías
      </Link>
      <Suspense fallback={<div className="h-80 max-w-3xl animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <NewBarbershop />
      </Suspense>
    </>
  );
}
