import { Suspense } from "react";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getBarbershopSettings } from "@/server/queries/barbershop";
import { getLandingSettings } from "@/server/queries/landing";
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
  if (!settings || !landing) return <p className="text-destructive">No encontramos tu barbería.</p>;

  return (
    <>
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
            Logo, portada, fotos de tus trabajos y redes para tu página ({`/${settings.profile.slug}`}).
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
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando configuración">
      <div className="h-96 animate-pulse rounded-xl bg-muted" />
      <div className="h-96 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
      <Suspense fallback={<SettingsSkeleton />}>
        <Settings />
      </Suspense>
    </>
  );
}
