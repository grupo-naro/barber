import { MapPin, MessageCircle, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { container, displayFont, focusRing, InstagramIcon } from "./ui";

type Props = {
  name: string;
  address: string | null;
  instagram: { handle: string; url: string } | null;
  whatsappHref: string | null;
  mapsUrl: string | null;
};

const linkClass = cn(
  focusRing,
  "flex min-h-11 items-center gap-2 text-white/90 underline-offset-4 transition-colors hover:text-white hover:underline",
);

export function Footer({ name, address, instagram, whatsappHref, mapsUrl }: Props) {
  return (
    <footer className="landing-grain pt-16 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-16">
      <div className={cn(container, "flex flex-col gap-10 md:flex-row md:items-end md:justify-between")}>
        <div className="flex flex-col gap-3">
          <p className={cn(displayFont, "text-5xl leading-[0.9] break-words")}>{name}</p>
          {address ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{address}</span>
            </p>
          ) : null}
          <a href="#reservar" className={cn(linkClass, "w-fit font-semibold text-[var(--rojo-claro)] hover:text-[var(--rojo-claro)]")}>
            Reservá online
          </a>
        </div>

        {instagram || whatsappHref || mapsUrl ? (
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {instagram ? (
              <li>
                <a href={instagram.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  <InstagramIcon className="size-4" />@{instagram.handle}
                </a>
              </li>
            ) : null}
            {whatsappHref ? (
              <li>
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  <MessageCircle className="size-4" aria-hidden />
                  WhatsApp
                </a>
              </li>
            ) : null}
            {mapsUrl ? (
              <li>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  <Navigation className="size-4" aria-hidden />
                  Cómo llegar
                </a>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </footer>
  );
}
