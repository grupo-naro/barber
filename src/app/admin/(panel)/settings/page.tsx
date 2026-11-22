import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPlatformSettings } from "@/server/queries/platform-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Ajustes — Barber · Admin" };

async function SettingsContent() {
  await requireAdminSession();
  const settings = await getPlatformSettings();

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold">Datos de transferencia y contacto</h2>
        </CardTitle>
        <CardDescription>
          Los ve el dueño en la pantalla de pago (nunca los barberos), junto al botón de Mercado Pago.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PlatformSettingsForm
          values={{
            transferAlias: settings?.transferAlias ?? "",
            transferCbu: settings?.transferCbu ?? "",
            transferHolder: settings?.transferHolder ?? "",
            contactWhatsapp: settings?.contactWhatsapp ?? "",
          }}
        />
      </CardContent>
    </Card>
  );
}

export default function AdminSettingsPage() {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Ajustes de la plataforma</h1>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}
