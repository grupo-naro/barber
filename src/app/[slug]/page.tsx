import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { validateSlug } from "@/lib/slugs";
import { cn } from "@/lib/utils";
import { BookingSection, BookingSectionSkeleton } from "./booking-section";
import { getCachedBarbershop, getCachedLanding } from "./data";
import { FloatingWhatsApp } from "./floating-whatsapp";
import { Footer } from "./footer";
import { Gallery } from "./gallery";
import { Hero } from "./hero";
import { HoursSection } from "./hours-section";
import { whatsappMessageUrl } from "./landing-format";
import { ServicesList, ServicesListSkeleton } from "./services-section";
import { container, displayFont } from "./ui";

// Con Cache Components, un `notFound()` sólo devuelve 404 si corre antes de empezar el
// streaming. Con `generateStaticParams` los params son conocidos al prerenderizar, así
// que la existencia del slug se resuelve (con el branding cacheado) antes del shell.
// No se prerenderizan barberías reales en el build: el placeholder sólo valida la ruta.
// Slugs reservados o con formato inválido (incluido el placeholder) son 404 sin tocar la DB.
// En `next start`, el 404 del primer request lo garantiza `src/proxy.ts` (ver ahí).
const PLACEHOLDER_SLUG = "__barberia__";

// Bloquear hasta resolver el slug es intencional (404 real para slugs inexistentes).
export const instant = false;

export function generateStaticParams() {
  return [{ slug: PLACEHOLDER_SLUG }];
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const valid = validateSlug(slug).ok;
  const [shop, landing] = valid ? await Promise.all([getCachedBarbershop(slug), getCachedLanding(slug)]) : [null, null];
  if (!shop) return { title: "Barbería no encontrada" };
  const title = `${shop.name} · Reservá tu turno`;
  const description = shop.description ?? `Reservá tu turno online en ${shop.name}.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(landing?.coverUrl ? { images: [landing.coverUrl] } : {}),
    },
  };
}

function SectionHeading({ id, title, intro }: { id: string; title: string; intro?: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <h2 id={id} className={cn(displayFont, "text-5xl leading-[0.9] break-words md:text-7xl")}>
        {title}
      </h2>
      {intro ? <p className="text-lg text-muted-foreground">{intro}</p> : null}
    </div>
  );
}

/** Divisor de barber pole entre secciones (decorativo). */
function PoleDivider({ thick = false }: { thick?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn("landing-pole border-y-[3px] border-black", thick ? "landing-pole-spin h-8" : "h-4")}
    />
  );
}

export default async function BarbershopPage({ params, searchParams }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const valid = validateSlug(slug).ok;
  const [shop, landing] = valid ? await Promise.all([getCachedBarbershop(slug), getCachedLanding(slug)]) : [null, null];
  if (!shop || !landing) notFound();

  const whatsappHref = whatsappMessageUrl(landing.whatsappUrl, shop.name);
  const address = shop.address?.trim() || null;

  return (
    <>
      <Hero
        shop={shop}
        coverUrl={landing.coverUrl}
        logoUrl={landing.logoUrl}
        instagram={landing.instagram}
        whatsappHref={whatsappHref}
      />

      <PoleDivider thick />

      <main className="flex flex-col">
        <section aria-labelledby="servicios-title" className="landing-paper landing-grain py-20 md:py-28">
          <div className={cn(container, "flex flex-col gap-10")}>
            <SectionHeading
              id="servicios-title"
              title="Servicios"
              intro="Tocá un servicio para reservarlo directamente."
            />
            <Suspense fallback={<ServicesListSkeleton />}>
              <ServicesList slug={shop.slug} />
            </Suspense>
          </div>
        </section>

        {landing.gallery.length > 0 ? (
          <section aria-labelledby="trabajos-title" className="landing-grain border-t-[3px] border-black py-20 md:py-28">
            <div className={cn(container, "flex flex-col gap-10")}>
              <SectionHeading id="trabajos-title" title="Nuestros trabajos" />
              <Gallery photos={landing.gallery} shopName={shop.name} />
            </div>
          </section>
        ) : null}

        <Suspense fallback={null}>
          <HoursSection
            slug={shop.slug}
            timeZone={shop.timezone}
            address={address}
            mapsUrl={landing.mapsUrl}
            phone={shop.phone}
          />
        </Suspense>

        <PoleDivider />

        <section
          id="reservar"
          aria-labelledby="reservar-title"
          className="landing-paper landing-grain scroll-mt-4 py-20 md:py-28"
        >
          <div className={cn(container, "grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-20")}>
            <div className="lg:sticky lg:top-10 lg:self-start">
              <SectionHeading
                id="reservar-title"
                title="Reservá tu turno"
                intro="Elegí el servicio, el día y el horario. Te lleva un minuto."
              />
            </div>
            <div className="min-w-0">
              <Suspense fallback={<BookingSectionSkeleton />}>
                <BookingSection slug={shop.slug} timeZone={shop.timezone} searchParams={searchParams} />
              </Suspense>
            </div>
          </div>
        </section>
      </main>

      <PoleDivider />

      <Footer
        name={shop.name}
        address={address}
        instagram={landing.instagram}
        whatsappHref={whatsappHref}
        mapsUrl={landing.mapsUrl}
      />

      {whatsappHref ? <FloatingWhatsApp href={whatsappHref} /> : null}
    </>
  );
}
