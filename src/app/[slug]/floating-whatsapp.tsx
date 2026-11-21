"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Botón flotante de WhatsApp, solo en mobile. Se oculta mientras la sección `#reservar` está en
 * pantalla, así nunca tapa los horarios ni "Confirmar reserva".
 */
export function FloatingWhatsApp({ href }: { href: string }) {
  const [bookingVisible, setBookingVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById("reservar");
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setBookingVisible(entry.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp"
      aria-hidden={bookingVisible || undefined}
      tabIndex={bookingVisible ? -1 : undefined}
      className={cn(
        "fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex size-14 -rotate-6 items-center justify-center rounded-full border-[3px] border-black bg-primary text-primary-foreground shadow-[4px_4px_0_#fff,4px_4px_0_3px_#000] md:hidden",
        "motion-safe:transition-[opacity,translate] motion-safe:duration-200",
        bookingVisible && "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <MessageCircle className="size-6" aria-hidden />
    </a>
  );
}
