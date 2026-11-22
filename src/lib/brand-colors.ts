// Colores editables de la landing pública: validación del input del dueño y paleta derivada con
// contraste automático (WCAG 2.x). Lógica pura, sin dependencias: la matemática de color está escrita
// a mano. El layout de `/[slug]` aplica el resultado como custom properties en la raíz del tema.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Color de marca: `#rrggbb` (normalizado a minúscula) o vacío/`null` → `null` (= color original). */
export const brandColorSchema = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || HEX_COLOR_RE.test(v), {
    message: "Ingresá un color en formato #rrggbb (por ejemplo #1f2e9a).",
  })
  .transform((v) => (v === null ? null : v.toLowerCase()));

export const brandColorsSchema = z.object({
  primary: brandColorSchema,
  secondary: brandColorSchema,
});

export type BrandColorsData = z.output<typeof brandColorsSchema>;

// ---------------------------------------------------------------------------
// Paleta original (job 016) y presets
// ---------------------------------------------------------------------------

export const DEFAULT_PRIMARY = "#1f2e9a";
export const DEFAULT_SECONDARY = "#d7191f";
const DEFAULT_SECONDARY_LIGHT = "#ff6b70";
const DEFAULT_PRIMARY_MUTED = "#dfe3ff";

export type BrandPreset = { id: string; name: string; primary: string; secondary: string };

/** Paletas sugeridas para el panel. Todas cumplen el contraste sin ajuste (lo verifica un test). */
export const BRAND_PRESETS: readonly BrandPreset[] = [
  { id: "clasico", name: "Clásico", primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY },
  { id: "verde-dorado", name: "Verde y dorado", primary: "#1b5e20", secondary: "#9a6700" },
  { id: "violeta-naranja", name: "Violeta y naranja", primary: "#5b21b6", secondary: "#c2410c" },
  { id: "bordo-celeste", name: "Bordó y celeste", primary: "#7f1d1d", secondary: "#0369a1" },
  { id: "grafito-amarillo", name: "Grafito y amarillo", primary: "#374151", secondary: "#8a6100" },
  { id: "petroleo-coral", name: "Petróleo y coral", primary: "#134e4a", secondary: "#c2364b" },
  { id: "noche-fucsia", name: "Azul noche y fucsia", primary: "#1e293b", secondary: "#be185d" },
];

// ---------------------------------------------------------------------------
// Matemática de color (sRGB ↔ HSL, luminancia y contraste WCAG 2.x)
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];
type Hsl = { h: number; s: number; l: number };

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl([r8, g8, b8]: Rgb): Hsl {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Tono HSL (0–360) de un `#rrggbb`. */
export function hueOf(hex: string): number {
  return rgbToHsl(hexToRgb(hex)).h;
}

function channel(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Contraste WCAG 2.x entre dos `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  return ratio(hexToRgb(a), hexToRgb(b));
}

// ---------------------------------------------------------------------------
// Ajuste de luminosidad
// ---------------------------------------------------------------------------

/** Texto normal (AA). */
const AA = 4.5;
/** Piso para que una superficie o franja no desaparezca sobre el negro de fondo. */
const SURFACE_ON_BLACK = 1.4;

/** Hex con la luminosidad HSL `l`, mismo tono y saturación. */
function withLightness(hsl: Hsl, l: number): string {
  return rgbToHex(hslToRgb({ ...hsl, l: Math.min(1, Math.max(0, l)) }));
}

/**
 * Busca la luminosidad más cercana a `from` (yendo hacia `to`) cuyo hex redondeado cumple `ok`.
 * La luminancia relativa crece monótonamente con `l` (a tono y saturación fijos), así que la búsqueda
 * binaria encuentra el borde; después se avanza de a poco por si el redondeo a 8 bits lo dejó afuera.
 */
function searchLightness(hsl: Hsl, from: number, to: number, ok: (hex: string) => boolean): string {
  if (ok(withLightness(hsl, from))) return withLightness(hsl, from);
  let bad = from;
  let good = to;
  for (let i = 0; i < 40; i++) {
    const mid = (bad + good) / 2;
    if (ok(withLightness(hsl, mid))) good = mid;
    else bad = mid;
  }
  const step = to > from ? 0.001 : -0.001;
  let l = good;
  while (!ok(withLightness(hsl, l)) && Math.abs(l - to) > 1e-9) l = to > from ? Math.min(to, l + step) : Math.max(to, l + step);
  return withLightness(hsl, l);
}

/** Superficie con texto blanco encima (≥ 4.5:1) que además se distingue del negro (≥ 1.4:1). */
function isSurfaceOk(hex: string): boolean {
  const rgb = hexToRgb(hex);
  return ratio(WHITE, rgb) >= AA && ratio(rgb, BLACK) >= SURFACE_ON_BLACK;
}

/** Devuelve el color tal cual si cumple; si no, lo oscurece o aclara (solo luminosidad) hasta cumplir. */
function fitSurface(hex: string): { hex: string; adjusted: boolean } {
  if (isSurfaceOk(hex)) return { hex, adjusted: false };
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb);
  // Cada condición es monótona en `l`: se busca solo la que falla (las dos a la vez no pueden fallar,
  // porque el rango que cumple ambas existe para cualquier tono: luminancia entre 0.02 y 0.18).
  const fixed =
    ratio(WHITE, rgb) < AA
      ? searchLightness(hsl, hsl.l, 0, (h) => contrastRatio("#ffffff", h) >= AA)
      : searchLightness(hsl, hsl.l, 1, (h) => contrastRatio(h, "#000000") >= SURFACE_ON_BLACK);
  return { hex: fixed, adjusted: true };
}

/** Tinte claro del secundario para usar como texto/ícono sobre negro (≥ 4.5:1). */
function lightTint(rojo: string): string {
  const hsl = rgbToHsl(hexToRgb(rojo));
  // Un escalón claramente más claro que el secundario (el original sube ~24 puntos), y lo que haga falta para el AA.
  const start = Math.min(0.95, Math.max(hsl.l + 0.24, 0.6));
  return searchLightness(hsl, start, 1, (hex) => contrastRatio(hex, "#000000") >= AA);
}

/** Tinte muy claro del principal para texto secundario sobre la superficie principal (≥ 4.5:1). */
function mutedTint(royal: string): string {
  const hsl = rgbToHsl(hexToRgb(royal));
  return searchLightness(hsl, 0.93, 1, (hex) => contrastRatio(hex, royal) >= AA);
}

export type BrandPalette = {
  /** `--royal`: superficie principal (sección horarios, sombras y franjas). */
  royal: string;
  /** `--rojo`: acento (botón primario, tags de precio, fila "hoy"). */
  rojo: string;
  /** `--rojo-claro`: acento legible sobre negro (links, íconos, `--destructive`). */
  rojoClaro: string;
  /** `--royal-muted`: texto secundario sobre `--royal`. */
  royalMuted: string;
  adjusted: { primary: boolean; secondary: boolean };
};

/**
 * Paleta de la landing a partir de los colores del dueño (`null` = original). Ajusta solo la
 * luminosidad para cumplir el contraste; con los originales devuelve exactamente los valores del job 016.
 */
export function brandPalette(primary: string | null, secondary: string | null): BrandPalette {
  const p = primary && HEX_COLOR_RE.test(primary) ? primary.toLowerCase() : DEFAULT_PRIMARY;
  const s = secondary && HEX_COLOR_RE.test(secondary) ? secondary.toLowerCase() : DEFAULT_SECONDARY;

  const royal = fitSurface(p);
  const rojo = fitSurface(s);
  return {
    royal: royal.hex,
    rojo: rojo.hex,
    rojoClaro: rojo.hex === DEFAULT_SECONDARY ? DEFAULT_SECONDARY_LIGHT : lightTint(rojo.hex),
    royalMuted: royal.hex === DEFAULT_PRIMARY ? DEFAULT_PRIMARY_MUTED : mutedTint(royal.hex),
    adjusted: { primary: royal.adjusted, secondary: rojo.adjusted },
  };
}

/** Custom properties de la paleta, para el `style` de un elemento (los valores salen de `brandPalette`). */
export function paletteVars(palette: BrandPalette): Record<`--${string}`, string> {
  return {
    "--royal": palette.royal,
    "--rojo": palette.rojo,
    "--rojo-claro": palette.rojoClaro,
    "--royal-muted": palette.royalMuted,
  };
}

/**
 * `style` de la raíz `.landing-theme`. Sin colores propios devuelve `undefined`: la landing queda
 * idéntica a la original (los valores por defecto viven en `landing.css`).
 */
export function brandStyle(primary: string | null, secondary: string | null): Record<`--${string}`, string> | undefined {
  if (primary === null && secondary === null) return undefined;
  return paletteVars(brandPalette(primary, secondary));
}
