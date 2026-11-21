import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("el hash no es el texto plano", async () => {
    const hash = await hashPassword("barber123");
    expect(hash).not.toBe("barber123");
    expect(hash).not.toContain("barber123");
  });

  it("dos hashes del mismo password difieren (salt aleatorio)", async () => {
    const [a, b] = await Promise.all([hashPassword("barber123"), hashPassword("barber123")]);
    expect(a).not.toBe(b);
  });

  it("acepta el password correcto y rechaza el incorrecto", async () => {
    const hash = await hashPassword("barber123");
    expect(await verifyPassword("barber123", hash)).toBe(true);
    expect(await verifyPassword("barber124", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("rechaza hashes malformados sin lanzar", async () => {
    for (const bad of ["", "barber123", "scrypt$zz$zz", "scrypt$abcd", "bcrypt$abcd$ef01", "scrypt$abcd$ef01"]) {
      expect(await verifyPassword("barber123", bad)).toBe(false);
    }
  });
});
