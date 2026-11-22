import { Anton, Kaushan_Script } from "next/font/google";
import { brandStyle } from "@/lib/brand-colors";
import { validateSlug } from "@/lib/slugs";
import { cn } from "@/lib/utils";
import { getCachedLanding } from "./data";
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

/**
 * Tema urbano solo para la web pública de cada barbería (incluye su `not-found`).
 * Los colores de marca se aplican acá, en la raíz `.landing-theme`, porque `--pole` y los tokens se
 * resuelven en este mismo elemento. Se leen con la misma lectura cacheada que la página (mismo tag,
 * solo barberías `ACTIVE`); un slug inválido no toca la DB y usa los colores por defecto.
 * Los valores del `style` salen siempre de `brandPalette` (hex `#rrggbb`), nunca del string guardado.
 */
export default async function BarbershopLayout({ children, params }: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const landing = validateSlug(slug).ok ? await getCachedLanding(slug) : null;
  const style = landing ? brandStyle(landing.brand.primary, landing.brand.secondary) : undefined;

  return (
    <div
      style={style}
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
