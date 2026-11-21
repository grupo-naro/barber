import { Anton, Kaushan_Script } from "next/font/google";
import { cn } from "@/lib/utils";
import "./landing.css";

// Display condensada para títulos (cartel de barbería de barrio) y un brush script para los tags,
// como el lettering de los logos. Un solo peso cada una; `latin` cubre á é í ó ú ñ ¡ ¿ y `latin-ext` los nombres con
// caracteres fuera de Latin-1 (ő, ć, ş…).
// El cuerpo sigue en Geist.
const display = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const script = Kaushan_Script({
  variable: "--font-script",
  weight: "400",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/** Tema urbano solo para la web pública de cada barbería (incluye su `not-found`). */
export default function BarbershopLayout({ children }: LayoutProps<"/[slug]">) {
  return (
    <div
      className={cn(
        "dark flex min-h-full flex-1 flex-col bg-background font-sans text-foreground",
        "landing-theme",
        display.variable,
        script.variable,
      )}
    >
      {children}
    </div>
  );
}
