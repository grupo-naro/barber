import { describe, expect, it } from "vitest";
import {
  BRAND_PRESETS,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  brandColorsSchema,
  brandColorSchema,
  brandPalette,
  brandStyle,
  contrastRatio,
  hueOf,
  type BrandPalette,
} from "./brand-colors";

const WHITE = "#ffffff";
const BLACK = "#000000";
const HEX = /^#[0-9a-f]{6}$/;

const ORIGINAL = {
  royal: "#1f2e9a",
  rojo: "#d7191f",
  rojoClaro: "#ff6b70",
  royalMuted: "#dfe3ff",
  adjusted: { primary: false, secondary: false },
};

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Todas las reglas de contraste de AC-2. */
function expectAccessible(p: BrandPalette) {
  for (const v of [p.royal, p.rojo, p.rojoClaro, p.royalMuted]) expect(v).toMatch(HEX);
  expect(contrastRatio(WHITE, p.rojo)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(p.rojo, WHITE)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(WHITE, p.royal)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(p.royalMuted, p.royal)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(p.rojoClaro, BLACK)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(p.royal, BLACK)).toBeGreaterThanOrEqual(1.4);
  expect(contrastRatio(p.rojo, BLACK)).toBeGreaterThanOrEqual(1.4);
}

describe("brand-colors: contraste WCAG", () => {
  it("calcula los ratios conocidos", () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, "#1f2e9a")).toBeCloseTo(10.96, 1);
    expect(contrastRatio(WHITE, "#d7191f")).toBeCloseTo(5.19, 1);
    expect(contrastRatio("#ff6b70", BLACK)).toBeCloseTo(7.59, 1);
  });
});

describe("brand-colors: brandPalette", () => {
  it("null/null da exactamente la paleta original", () => {
    expect(brandPalette(null, null)).toEqual(ORIGINAL);
  });

  it("los originales explícitos (en cualquier caja) dan la paleta original", () => {
    expect(brandPalette(DEFAULT_PRIMARY, DEFAULT_SECONDARY)).toEqual(ORIGINAL);
    expect(brandPalette("#1F2E9A", "#D7191F")).toEqual(ORIGINAL);
    expect(brandPalette(DEFAULT_PRIMARY, null)).toEqual(ORIGINAL);
  });

  it("sin colores propios no hay style en la raíz (DOM idéntico al original)", () => {
    expect(brandStyle(null, null)).toBeUndefined();
    expect(brandStyle("#1b5e20", null)).toEqual({
      "--royal": "#1b5e20",
      "--rojo": "#d7191f",
      "--rojo-claro": "#ff6b70",
      "--royal-muted": expect.stringMatching(HEX),
    });
  });

  it.each(["#ffff00", "#7fff00", "#ffffff", "#ff8c00", "#00ffff"])(
    "un secundario claro (%s) se oscurece conservando el tono",
    (input) => {
      const p = brandPalette(null, input);
      expect(p.adjusted).toEqual({ primary: false, secondary: true });
      expect(p.rojo).not.toBe(input);
      expect(contrastRatio(WHITE, p.rojo)).toBeGreaterThanOrEqual(4.5);
      // Ajuste mínimo: no se pasa de largo (queda cerca del borde de 4.5:1).
      expect(contrastRatio(WHITE, p.rojo)).toBeLessThan(4.8);
      if (input !== "#ffffff") expect(hueDistance(hueOf(p.rojo), hueOf(input))).toBeLessThanOrEqual(5);
      expectAccessible(p);
    },
  );

  it("un principal claro se oscurece y marca adjusted.primary", () => {
    const p = brandPalette("#7fff00", null);
    expect(p.adjusted).toEqual({ primary: true, secondary: false });
    expect(hueDistance(hueOf(p.royal), hueOf("#7fff00"))).toBeLessThanOrEqual(5);
    expectAccessible(p);
  });

  it.each(["#000000", "#050505", "#0a0014", "#001a00"])("un color casi negro (%s) se aclara hasta el piso de 1.4:1", (input) => {
    const p = brandPalette(input, input);
    expect(p.adjusted).toEqual({ primary: true, secondary: true });
    for (const v of [p.royal, p.rojo]) {
      expect(contrastRatio(v, BLACK)).toBeGreaterThanOrEqual(1.4);
      expect(contrastRatio(v, BLACK)).toBeLessThan(1.6);
    }
    if (input !== "#000000" && input !== "#050505") {
      expect(hueDistance(hueOf(p.royal), hueOf(input))).toBeLessThanOrEqual(5);
    }
    expectAccessible(p);
  });

  it("un color que ya cumple se devuelve sin tocar", () => {
    const p = brandPalette("#14532d", "#b91c1c");
    expect(p.royal).toBe("#14532d");
    expect(p.rojo).toBe("#b91c1c");
    expect(p.adjusted).toEqual({ primary: false, secondary: false });
    expectAccessible(p);
  });

  it("el claro se deriva del secundario aclarándolo sin cambiar el tono", () => {
    const p = brandPalette(null, "#0369a1");
    expect(hueDistance(hueOf(p.rojoClaro), hueOf(p.rojo))).toBeLessThanOrEqual(5);
    expect(contrastRatio(p.rojoClaro, BLACK)).toBeGreaterThan(contrastRatio(p.rojo, BLACK));
    const green = brandPalette("#1b5e20", null);
    expect(hueDistance(hueOf(green.royalMuted), hueOf("#1b5e20"))).toBeLessThanOrEqual(5);
    expect(contrastRatio(green.royalMuted, green.royal)).toBeGreaterThanOrEqual(4.5);
  });

  it("cumple todas las reglas en un barrido de colores", () => {
    for (let r = 0; r < 256; r += 51) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
          expectAccessible(brandPalette(hex, hex));
        }
      }
    }
  });

  it("todas las paletas predefinidas pasan sin ajuste", () => {
    expect(BRAND_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(BRAND_PRESETS.length).toBeLessThanOrEqual(8);
    expect(BRAND_PRESETS[0]).toMatchObject({ name: "Clásico", primary: "#1f2e9a", secondary: "#d7191f" });
    for (const preset of BRAND_PRESETS) {
      const p = brandPalette(preset.primary, preset.secondary);
      expect(p.adjusted, preset.name).toEqual({ primary: false, secondary: false });
      expect(p.royal).toBe(preset.primary);
      expect(p.rojo).toBe(preset.secondary);
      expectAccessible(p);
    }
  });
});

describe("brand-colors: validación", () => {
  it("acepta #rrggbb y normaliza a minúscula", () => {
    expect(brandColorSchema.parse("#1F2E9A")).toBe("#1f2e9a");
    expect(brandColorSchema.parse("#abcdef")).toBe("#abcdef");
  });

  it("vacío, null o ausente → null (color original)", () => {
    expect(brandColorSchema.parse("")).toBeNull();
    expect(brandColorSchema.parse(null)).toBeNull();
    expect(brandColorSchema.parse(undefined)).toBeNull();
  });

  it.each(["red", "#fff", "#12345g", "#000000;}", "url(https://evil.test/x.png)", " #000000", "#0000000", "#1f2e9a\n", "1f2e9a"])(
    "rechaza %j",
    (value) => {
      expect(brandColorSchema.safeParse(value).success).toBe(false);
    },
  );

  it("el schema del form valida los dos campos", () => {
    expect(brandColorsSchema.parse({ primary: "#1B5E20", secondary: "" })).toEqual({ primary: "#1b5e20", secondary: null });
    const bad = brandColorsSchema.safeParse({ primary: "#000000;}", secondary: "url(x)" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.path[0]).sort()).toEqual(["primary", "secondary"]);
  });
});
