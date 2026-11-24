// Esqueletos con la forma de cada pantalla del panel, con su encabezado. Los usan la página (mientras carga) y
// los fallbacks de los layouts. Sin datos de la sesión: entran en el HTML estático y en el prefetch.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PanelBody, PanelHeader } from "./panel-header";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-border", className)} />;
}

/** Renglón gris del contexto del encabezado: reserva su alto. */
function ContextLine() {
  return <span className="inline-block h-[0.8em] w-36 animate-pulse rounded bg-(--panel-header-muted)/30" />;
}

function Loading({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("flex flex-col gap-4", className)}
      role="status"
      aria-busy="true"
      aria-label={label}
      data-skeleton=""
    >
      {children}
    </div>
  );
}

const listClass = "flex flex-col divide-y overflow-hidden rounded-xl border bg-card";

function ListRow({ avatar = false }: { avatar?: boolean }) {
  return (
    <div className="flex min-h-17 items-center gap-3 px-4 py-3">
      {avatar ? <Block className="size-9 rounded-full" /> : null}
      <div className="flex flex-1 flex-col gap-2">
        <Block className="h-4 w-2/5" />
        <Block className="h-3 w-1/4" />
      </div>
      <Block className="h-4 w-16" />
    </div>
  );
}

function FormBlock({ fields }: { fields: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <Block className="h-5 w-40" />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Block className="h-3 w-24" />
          <Block className="h-11 w-full" />
        </div>
      ))}
      <Block className="h-11 w-full" />
    </div>
  );
}

/** Círculo del avatar de Hoy. */
function AvatarCircle() {
  return <span className="size-11 shrink-0 rounded-full border-2 border-(--panel-header-muted)" aria-hidden />;
}

export function TodaySkeleton() {
  return (
    <>
      <PanelHeader title="Hoy" context={<ContextLine />} action={<AvatarCircle />} />
      <Loading label="Cargando la agenda" className="mx-auto w-full max-w-3xl flex-1 gap-0 pb-(--panel-bar)">
        <div className="flex min-h-13 items-center px-4.5 sm:px-4">
          <Block className="h-4 w-60" />
        </div>
        <div className="divide-y border-y bg-card sm:border-x">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex min-h-17 items-center gap-3 px-4.5 py-3 sm:px-4">
              <Block className="h-6 w-12" />
              <div className="flex flex-1 flex-col gap-2">
                <Block className="h-4 w-2/5" />
                <Block className="h-3 w-1/4" />
              </div>
              <Block className="h-4 w-16" />
            </div>
          ))}
        </div>
        <div className="sticky bottom-(--panel-bar) mt-auto border-t bg-card px-3.5 py-2.5 sm:border-x">
          <Block className="h-14 w-full rounded-[10px]" />
        </div>
      </Loading>
    </>
  );
}

export function CashSkeleton() {
  return (
    <>
      <PanelHeader title="Caja" context={<ContextLine />} />
      <PanelBody>
        <Loading label="Cargando la caja">
          <div className="flex items-end gap-2">
            <Block className="size-11" />
            <Block className="h-11 flex-1" />
            <Block className="size-11" />
          </div>
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <Block className="h-5 w-48" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Block key={i} className="h-16" />
              ))}
            </div>
            <Block className="h-12 w-full" />
          </div>
          <div className={listClass}>
            {[0, 1, 2].map((i) => (
              <ListRow key={i} />
            ))}
          </div>
        </Loading>
      </PanelBody>
    </>
  );
}

export function ServicesSkeleton() {
  return (
    <>
      <PanelHeader title="Servicios" context={<ContextLine />} />
      <PanelBody>
        <Loading label="Cargando servicios">
          <Block className="h-12 w-full rounded-xl" />
          <div className={listClass}>
            {[0, 1, 2, 3, 4].map((i) => (
              <ListRow key={i} />
            ))}
          </div>
        </Loading>
      </PanelBody>
    </>
  );
}

export function BarbersSkeleton() {
  return (
    <>
      <PanelHeader title="Barberos" context={<ContextLine />} />
      <PanelBody>
        <Loading label="Cargando barberos">
          <Block className="h-32 w-full rounded-xl" />
          <div className={listClass}>
            {[0, 1, 2, 3].map((i) => (
              <ListRow key={i} avatar />
            ))}
          </div>
        </Loading>
      </PanelBody>
    </>
  );
}

export function SettingsSkeleton() {
  return (
    <>
      <PanelHeader
        title="Ajustes"
        context={<ContextLine />}
        action={<Block className="h-11 w-28 bg-(--panel-header-muted)/30" />}
      />
      <PanelBody>
        <Loading label="Cargando ajustes">
          <FormBlock fields={4} />
          <FormBlock fields={2} />
        </Loading>
      </PanelBody>
    </>
  );
}

export function AccountSkeleton() {
  return (
    <>
      <PanelHeader title="Mi cuenta" context={<ContextLine />} />
      <PanelBody>
        <Loading label="Cargando tu cuenta">
          <div className="flex flex-col gap-2">
            <Block className="h-4 w-48" />
            <Block className="h-4 w-56" />
          </div>
          <FormBlock fields={3} />
          <Block className="h-11 w-full" />
        </Loading>
      </PanelBody>
    </>
  );
}

export function CustomerSkeleton() {
  return (
    <>
      <PanelHeader title="Cliente" context={<ContextLine />} backHref="/dashboard/today" />
      <PanelBody>
        <Loading label="Cargando la ficha">
          <FormBlock fields={1} />
          <Block className="h-5 w-36" />
          <div className={listClass}>
            {[0, 1, 2].map((i) => (
              <ListRow key={i} />
            ))}
          </div>
        </Loading>
      </PanelBody>
    </>
  );
}

export function ServiceDetailSkeleton() {
  return (
    <>
      <PanelHeader title="Editar servicio" context={<ContextLine />} backHref="/dashboard/services" />
      <PanelBody>
        <Loading label="Cargando el servicio">
          <FormBlock fields={5} />
        </Loading>
      </PanelBody>
    </>
  );
}

export function BarberDetailSkeleton() {
  return (
    <>
      <PanelHeader title="Barbero" context={<ContextLine />} backHref="/dashboard/barbers" />
      <PanelBody>
        <Loading label="Cargando el barbero">
          <Block className="h-5 w-48" />
          <FormBlock fields={3} />
        </Loading>
      </PanelBody>
    </>
  );
}

/** Pantalla que todavía no se conoce: encabezado negro y filas, nunca en blanco. */
export function GenericSkeleton() {
  return (
    <>
      <div className="panel-header bg-(--panel-header) pt-(--panel-safe-top)" aria-hidden>
        <div className="min-h-24" />
      </div>
      <PanelBody>
        <Loading label="Cargando">
          <div className={listClass}>
            {[0, 1, 2, 3].map((i) => (
              <ListRow key={i} />
            ))}
          </div>
        </Loading>
      </PanelBody>
    </>
  );
}
