import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVATE_PREFIXES } from "@/proxy";
import { RESERVED_SLUGS, isReservedSlug, validateSlug } from "./slugs";

describe("slugs: validateSlug", () => {
  it("acepta slugs con formato válido y no reservados", () => {
    for (const s of ["barberia-demo", "otra-barberia", "abc", "barberia-123"]) {
      expect(validateSlug(s), s).toEqual({ ok: true });
    }
  });

  it("rechaza formatos inválidos con mensaje en español", () => {
    const invalid = [
      "",
      "ab",
      "a".repeat(41),
      "Barberia",
      "barbería",
      "-demo",
      "demo-",
      "de--mo",
      "de mo",
      "de_mo",
      "de.mo",
      "de/mo",
    ];
    for (const s of invalid) {
      const r = validateSlug(s);
      expect(r.ok, JSON.stringify(s)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/slug|Usá|reservada/);
    }
  });

  it("rechaza todos los slugs reservados", () => {
    expect(RESERVED_SLUGS.size).toBeGreaterThan(20);
    for (const s of ["login", "dashboard", "api", "_next", ...RESERVED_SLUGS]) {
      const r = validateSlug(s);
      expect(r.ok, s).toBe(false);
      if (!r.ok) expect(r.error).toContain("reservada");
    }
  });

  it("isReservedSlug", () => {
    expect(isReservedSlug("dashboard")).toBe(true);
    expect(isReservedSlug("media")).toBe(true);
    expect(isReservedSlug("Media")).toBe(true);
    expect(isReservedSlug("invitacion")).toBe(true);
    expect(validateSlug("invitacion").ok).toBe(false);
    expect(isReservedSlug("barberia-demo")).toBe(false);
  });
});

describe("slugs: coherencia con el resto del repo", () => {
  const root = path.resolve(__dirname, "../..");
  const sources = ["prisma/seed.ts", "scripts/booking-smoke.ts", "scripts/cash-smoke.ts"];

  it("los slugs del seed y de los smoke son válidos", () => {
    const slugs: string[] = [];
    for (const file of sources) {
      const text = readFileSync(path.join(root, file), "utf8");
      for (const m of text.matchAll(/(?:\bslug:\s*|\b[A-Z_]*SLUG\s*=\s*)"([^"]*)"/g)) slugs.push(m[1]);
    }
    expect(slugs.length).toBeGreaterThanOrEqual(2);
    expect(slugs).toContain("barberia-demo");
    for (const s of slugs) expect(validateSlug(s), s).toEqual({ ok: true });
  });

  it("cada ruta privada del panel es un slug reservado", () => {
    for (const prefix of PRIVATE_PREFIXES) expect(isReservedSlug(prefix.slice(1)), prefix).toBe(true);
  });
});
