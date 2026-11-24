import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getBarbershopSettings } from "@/server/queries/barbershop";
import { getLandingSettings } from "@/server/queries/landing";
import { headerActionClass, PanelBody, PanelHeader } from "@/components/panel/panel-header";
import { SettingsSkeleton } from "@/components/panel/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { HoursForm } from "./hours-form";
import { LandingForm } from "./landing-form";

export const metadata: Metadata = { title: "Ajustes — Barber" };

async function Settings() {
  const session = await requireRole("OWNER");
  const [settings, landing] = await Promise.all([
    getBarbershopSettings(session.barbershopId),
    getLandingSettings(session.barbershopId),
  ]);
  const header = (
    <PanelHeader
      title="Ajustes"
      context={session.barbershop.name}
      action={
        <Link href="/dashboard/account" className={headerActionClass}>
          Mi cuenta
        </Link>
      }
    />
  );
  if (!settings || !landing) {
    return (
      <>
        {header}
        <PanelBody>
          <p className="text-destructive">No encontramos tu barbería.</p>
        </PanelBody>
      </>
    );
  }

  return (
    <>
      {header}
      <PanelBody>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Perfil</h2>
            </CardTitle>
            <CardDescription>
              Lo que ven tus clientes en tu página pública ({`/${settings.profile.slug}`}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={settings.profile} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Página pública</h2>
            </CardTitle>
            <CardDescription>
              Logo, portada, fotos de tus trabajos, redes y colores para tu página ({`/${settings.profile.slug}`}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LandingForm landing={landing} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg font-semibold">Horarios de atención</h2>
            </CardTitle>
            <CardDescription>Los turnos online se ofrecen solo dentro de estos horarios.</CardDescription>
          </CardHeader>
          <CardContent>
            <HoursForm hours={settings.hours} />
          </CardContent>
        </Card>
      </PanelBody>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <Settings />
    </Suspense>
  );
}
