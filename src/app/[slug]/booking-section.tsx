import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { bookableDates, isValidTime, weekdayOf, zonedTimeToUtc } from "@/lib/slots";
import { businessDate, localTime } from "@/lib/time";
import { getAvailableSlots, getOnlineServices, type PublicService } from "@/server/queries/booking";
import { BookingForm } from "./booking-form";
import { displayFont } from "./ui";
import {
  bookingHref,
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatPrice,
  type Selection,
} from "./format";

type SearchParams = PageProps<"/[slug]">["searchParams"];

function param(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : undefined;
}

const choiceClass =
  "min-h-11 rounded-sm border-2 border-black bg-white px-3 py-2 text-sm font-semibold text-black transition-colors hover:bg-muted";
const selectedClass = "bg-primary text-primary-foreground shadow-[3px_3px_0_#000] hover:bg-primary";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="landing-sticker flex flex-col gap-4 rounded-md bg-card p-4 sm:p-5" aria-labelledby={`step-${n}`}>
      <h3 id={`step-${n}`} className={cn(displayFont, "flex items-center gap-3 text-2xl leading-none")}>
        <span className="flex size-9 shrink-0 -rotate-3 items-center justify-center bg-black text-xl text-white tabular-nums">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function BookingSectionSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="h-5 w-40 motion-safe:animate-pulse rounded bg-muted" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 motion-safe:animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

export async function BookingSection({
  slug,
  timeZone,
  searchParams,
}: {
  slug: string;
  timeZone: string;
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  await connection(); // disponibilidad y "hoy" siempre por request
  const services = await getOnlineServices(slug);

  const today = businessDate(new Date(), timeZone);
  const dates = bookableDates(today);

  // La selección vive en la URL; cualquier valor que no sea del tenant se ignora. El barbero no se
  // elige al reservar (se asigna en la barbería), así que `?barber=` no se lee.
  const service = services.find((s) => s.id === param(query.service));
  const dateParam = param(query.date);
  const date = dateParam && dates.includes(dateParam) ? dateParam : undefined;
  const timeParam = param(query.time);
  const time = timeParam && isValidTime(timeParam) ? timeParam : undefined;

  const selection: Selection = { service: service?.id, date };

  return (
    <div className="flex flex-col gap-8">
      <Step n={1} title="Elegí el servicio">
        {services.length === 0 ? (
          <p className="text-sm text-muted-foreground">Por ahora no hay servicios para reservar online.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {services.map((s) => (
              <li key={s.id}>
                <ServiceOption service={s} slug={slug} selected={s.id === service?.id} selection={selection} />
              </li>
            ))}
          </ul>
        )}
      </Step>

      {service ? (
        <Step n={2} title="Elegí el día">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-0.5 pb-2 sm:-mx-5 sm:px-5">
            {dates.map((d) => {
              const label = formatDayShort(d, timeZone);
              const selected = d === date;
              return (
                <Link
                  key={d}
                  href={bookingHref(slug, { ...selection, date: d })}
                  scroll={false}
                  className={cn(
                    choiceClass,
                    "flex min-w-16 shrink-0 flex-col items-center gap-0.5",
                    weekdayOf(d) === 0 && !selected && "text-muted-foreground",
                    selected && selectedClass,
                  )}
                  aria-current={selected ? "date" : undefined}
                >
                  <span className="text-xs capitalize">{d === today ? "hoy" : label.weekday}</span>
                  <span>{label.day}</span>
                </Link>
              );
            })}
          </div>
        </Step>
      ) : null}

      {service && date ? (
        <Step n={3} title="Elegí el horario">
          <Suspense key={`${service.id}-${date}`} fallback={<SlotsSkeleton />}>
            <SlotList
              slug={slug}
              timeZone={timeZone}
              service={service}
              date={date}
              time={time}
              selection={selection}
            />
          </Suspense>
        </Step>
      ) : null}
    </div>
  );
}

function ServiceOption({
  service,
  slug,
  selected,
  selection,
}: {
  service: PublicService;
  slug: string;
  selected: boolean;
  selection: Selection;
}) {
  return (
    <Link
      href={bookingHref(slug, { ...selection, service: service.id })}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex items-start justify-between gap-4 rounded-sm border-2 border-black bg-white p-4 text-black transition-colors hover:bg-muted",
        selected && "shadow-[4px_4px_0_var(--rojo)]",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">{service.name}</span>
        {service.description ? <span className="text-sm text-muted-foreground">{service.description}</span> : null}
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {formatDuration(service.durationMinutes)}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="font-semibold text-primary tabular-nums">{formatPrice(service.price)}</span>
        {selected ? <Badge className="rounded-sm">Elegido</Badge> : null}
      </div>
    </Link>
  );
}

function SlotsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-2" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-11 motion-safe:animate-pulse rounded-sm bg-muted" />
      ))}
    </div>
  );
}

async function SlotList({
  slug,
  timeZone,
  service,
  date,
  time,
  selection,
}: {
  slug: string;
  timeZone: string;
  service: PublicService;
  date: string;
  time?: string;
  selection: Selection;
}) {
  const result = await getAvailableSlots(slug, {
    serviceId: service.id,
    date,
    now: new Date(),
  });
  const slots = result?.slots ?? [];
  const dayLabel = formatDayLong(date, timeZone);

  const startsAt = time ? zonedTimeToUtc(date, time, timeZone) : undefined;
  const available = startsAt ? slots.some((s) => s.getTime() === startsAt.getTime()) : false;

  return (
    <div className="flex flex-col gap-4">
      {!result?.open ? (
        <p className="rounded-sm bg-muted p-3 text-sm text-muted-foreground">
          <span className="first-letter:uppercase">{dayLabel}</span>: estamos cerrados. Elegí otro día.
        </p>
      ) : slots.length === 0 ? (
        <p className="rounded-sm bg-muted p-3 text-sm text-muted-foreground">
          No quedan horarios para ese día. Probá con otro día.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {slots.map((slot) => {
            const label = localTime(slot, timeZone);
            const selected = label === time;
            return (
              <Link
                key={slot.toISOString()}
                href={bookingHref(slug, { ...selection, time: label })}
                scroll={false}
                className={cn(choiceClass, "text-center tabular-nums", selected && selectedClass)}
                aria-current={selected ? "true" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}

      {startsAt && time ? (
        <BookingForm
          key={`${service.id}-${date}-${time}`}
          slug={slug}
          serviceId={service.id}
          serviceName={service.name}
          servicePrice={formatPrice(service.price)}
          startsAt={startsAt.toISOString()}
          dayLabel={dayLabel}
          timeLabel={time}
          available={available}
          timeZone={timeZone}
        />
      ) : null}
    </div>
  );
}
