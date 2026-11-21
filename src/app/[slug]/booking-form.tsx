"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { bookAppointment, type BookingFormState } from "@/server/actions/booking";
import { displayFont, stickerButton } from "./ui";

/** Card sticker: borde grueso y sombra dura, sin el anillo fino de shadcn. */
const cardClass = "landing-sticker scroll-mt-4 rounded-md ring-0";

type Props = {
  slug: string;
  serviceId: string;
  serviceName: string;
  servicePrice: string;
  startsAt: string;
  dayLabel: string;
  timeLabel: string;
  available: boolean;
  timeZone: string;
};

export function BookingForm(props: Props) {
  const [state, formAction, pending] = useActionState<BookingFormState, FormData>(bookAppointment, null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Con `scroll={false}` el formulario aparece debajo de la grilla: lo traemos a la vista.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    containerRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  if (state?.ok) {
    const startsAt = new Date(state.startsAt);
    const day = new Intl.DateTimeFormat("es-AR", {
      timeZone: props.timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(startsAt);
    const time = new Intl.DateTimeFormat("es-AR", {
      timeZone: props.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(startsAt);
    return (
      <Card ref={containerRef} role="status" aria-live="polite" className={cn(cardClass, "[--sticker-shadow:var(--rojo)]")}>
        <CardHeader>
          <CardTitle className={cn(displayFont, "flex items-center gap-2 text-2xl leading-tight")}>
            <CheckCircle2 className="size-6 shrink-0 text-primary" aria-hidden />
            ¡Listo! Tu turno quedó reservado
          </CardTitle>
          <CardDescription>Te esperamos. Si no podés venir, avisanos por WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Servicio</dt>
            <dd className="font-medium">{props.serviceName}</dd>
            <dt className="text-muted-foreground">Precio</dt>
            <dd className="font-medium tabular-nums">{props.servicePrice}</dd>
            <dt className="text-muted-foreground">Día</dt>
            <dd className="font-medium first-letter:uppercase">{day}</dd>
            <dt className="text-muted-foreground">Hora</dt>
            <dd className="font-medium tabular-nums">{time} hs</dd>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">
            El barbero se asigna en la barbería: atendemos por orden de llegada, así que te pedimos que vengas
            unos minutos antes.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!props.available) {
    return (
      <p ref={containerRef} className="scroll-mt-4 rounded-sm border-2 border-destructive bg-white p-3 text-sm font-medium text-destructive">
        Ese horario ya no está disponible. Elegí otro de la lista.
      </p>
    );
  }

  return (
    <Card ref={containerRef} className={cardClass}>
      <CardHeader>
        <CardTitle className={cn(displayFont, "text-2xl leading-tight")}>Tus datos</CardTitle>
        <CardDescription>
          {props.serviceName} ({props.servicePrice}) · <span className="first-letter:uppercase">{props.dayLabel}</span>{" "}
          a las <span className="tabular-nums">{props.timeLabel}</span> hs
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="slug" value={props.slug} />
          <input type="hidden" name="serviceId" value={props.serviceId} />
          <input type="hidden" name="startsAt" value={props.startsAt} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="booking-name">Nombre y apellido</Label>
            <Input
              id="booking-name"
              name="name"
              autoComplete="name"
              enterKeyHint="next"
              required
              minLength={2}
              maxLength={80}
              placeholder="Juan Pérez"
              className="h-11 rounded-sm border-2 bg-white text-base dark:bg-white"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="booking-phone">Teléfono (WhatsApp)</Label>
            <Input
              id="booking-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="send"
              required
              maxLength={40}
              placeholder="11 2345-6789"
              className="h-11 rounded-sm border-2 bg-white text-base dark:bg-white"
            />
          </div>
          {state && !state.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" className={cn(stickerButton, "mt-1 w-full [--sticker-shadow:#000]")} disabled={pending}>
            {pending ? "Reservando…" : "Confirmar reserva"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
