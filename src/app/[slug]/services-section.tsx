import Link from "next/link";
import { connection } from "next/server";
import { getOnlineServices } from "@/server/queries/booking";
import { bookingHref, formatDuration, formatPrice } from "./format";
import { cn } from "@/lib/utils";
import { displayFont, focusRing } from "./ui";

/** Lista de precios en stickers: cada servicio preselecciona la reserva y salta a `#reservar`. */
export async function ServicesList({ slug }: { slug: string }) {
  await connection(); // los servicios online no se cachean (los cambia el panel)
  const services = await getOnlineServices(slug);

  if (services.length === 0) {
    return <p className="text-muted-foreground">Por ahora no hay servicios para reservar online.</p>;
  }

  return (
    <ul className="grid gap-5 md:grid-cols-2 md:gap-6">
      {services.map((s) => (
        <li key={s.id} className="flex">
          <Link
            href={`${bookingHref(slug, { service: s.id })}#reservar`}
            className={cn(
              focusRing,
              "landing-sticker landing-lift flex w-full flex-col gap-2 rounded-md bg-card p-5 text-card-foreground",
            )}
          >
            <span className="flex items-center gap-3">
              <span className={cn(displayFont, "min-w-0 text-2xl leading-tight break-words sm:text-3xl")}>{s.name}</span>
              <span aria-hidden className="landing-leader" />
              <span
                className={cn(
                  displayFont,
                  "shrink-0 rotate-2 bg-primary px-2 py-0.5 text-xl text-primary-foreground tabular-nums",
                )}
              >
                {formatPrice(s.price)}
              </span>
            </span>
            <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{formatDuration(s.durationMinutes)}</span>
              {s.description ? <span className="min-w-0">{s.description}</span> : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ServicesListSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-2 md:gap-6" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-24 motion-safe:animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}
