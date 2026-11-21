import { connection } from "next/server";
import { MapPin, Navigation, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { weekdayOf } from "@/lib/slots";
import { businessDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getPublicOpeningHours } from "@/server/queries/landing";
import { hasOpeningHours, weeklyHours } from "./landing-format";
import { container, displayFont, focusRing, stickerButton } from "./ui";

type Props = {
  slug: string;
  timeZone: string;
  address: string | null;
  mapsUrl: string | null;
  phone: string | null;
};

/**
 * Horarios de lunes a domingo (con "hoy" resaltado) y ubicación. Se lee por request: los horarios
 * no se cachean y "hoy" depende del momento. Sin horarios ni ubicación, la sección no aparece.
 */
export async function HoursSection({ slug, timeZone, address, mapsUrl, phone }: Props) {
  await connection();
  const rows = (await getPublicOpeningHours(slug)) ?? [];
  const today = weekdayOf(businessDate(new Date(), timeZone));
  const days = weeklyHours(rows, today);
  const showHours = hasOpeningHours(days);
  const showLocation = Boolean(address || mapsUrl || phone);
  if (!showHours && !showLocation) return null;

  return (
    <section aria-labelledby="horarios-title" className="landing-royal landing-grain py-20 md:py-28">
      <div className={cn(container, "grid items-start gap-x-16 gap-y-10 md:grid-cols-2")}>
        <h2 id="horarios-title" className={cn(displayFont, "text-5xl leading-[0.9] break-words md:col-span-2 md:text-7xl")}>
          {showHours ? "Horarios y ubicación" : "Dónde estamos"}
        </h2>

        {showHours ? (
          <dl className="landing-sticker flex flex-col rounded-md bg-white px-4 py-2 text-black sm:px-6">
            {days.map((d) => (
              <div
                key={d.weekday}
                aria-current={d.isToday ? "date" : undefined}
                className={cn(
                  "flex items-baseline justify-between gap-4 border-b-2 border-black/10 py-3 last:border-b-0",
                  d.isToday && "-mx-6 -my-px -rotate-1 border-b-0 bg-[var(--rojo)] px-6 text-white shadow-[4px_4px_0_#000] sm:-mx-8 sm:px-8",
                )}
              >
                <dt className={cn("flex items-baseline gap-2", d.isToday ? "font-semibold" : "font-medium")}>
                  {d.label}
                  {d.isToday ? (
                    <span className={cn(displayFont, "bg-black px-1.5 py-0.5 text-xs leading-none text-white")}>hoy</span>
                  ) : null}
                </dt>
                <dd
                  className={cn(
                    "tabular-nums",
                    d.closed && !d.isToday && "text-[#4a4a4a]",
                    d.isToday && "font-semibold",
                  )}
                >
                  {d.hours}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {showLocation ? (
          <div className="flex flex-col gap-6">
            {address ? (
              <p className={cn(displayFont, "flex items-start gap-3 text-3xl leading-tight sm:text-4xl")}>
                <MapPin className="mt-1.5 size-7 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{address}</span>
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-4">
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({
                    variant: "outline",
                    className: cn(stickerButton, "bg-white text-black hover:bg-white hover:text-black dark:bg-white dark:hover:bg-white"),
                  })}
                >
                  <Navigation aria-hidden />
                  Cómo llegar
                </a>
              ) : null}
              {phone ? (
                <a
                  href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                  className={cn(
                    focusRing,
                    "flex min-h-12 items-center gap-2 px-1 text-lg font-medium underline-offset-4 hover:underline",
                  )}
                >
                  <Phone className="size-5" aria-hidden />
                  {phone}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
