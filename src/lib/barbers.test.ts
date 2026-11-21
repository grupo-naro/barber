import { describe, expect, it } from "vitest";
import {
  barberAccessStatus,
  changePasswordSchema,
  choosePasswordSchema,
  createBarberSchema,
  updateBarberSchema,
} from "./barbers";

describe("createBarberSchema", () => {
  it("normaliza el email con trim y minúsculas y recorta el nombre", () => {
    const r = createBarberSchema.safeParse({ name: "  Juan  ", email: "  Juan.Perez@Example.COM " });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ name: "Juan", email: "juan.perez@example.com" });
  });

  it.each(["", "juan", "juan@", "@example.com", "juan perez@example.com"])("rechaza el email inválido %j", (email) => {
    const r = createBarberSchema.safeParse({ name: "Juan", email });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["email"]);
  });

  it("exige nombre de 1 a 80 caracteres", () => {
    expect(createBarberSchema.safeParse({ name: "   ", email: "a@b.co" }).success).toBe(false);
    expect(createBarberSchema.safeParse({ name: "x".repeat(81), email: "a@b.co" }).success).toBe(false);
    expect(createBarberSchema.safeParse({ name: "x".repeat(80), email: "a@b.co" }).success).toBe(true);
  });
});

describe("updateBarberSchema", () => {
  const base = { userId: "u1", name: "Juan" };

  it("reutiliza las reglas de liquidación", () => {
    expect(updateBarberSchema.safeParse({ ...base, payoutScheme: "PERCENTAGE", payoutValue: "40,5" }).data).toEqual({
      ...base,
      payoutScheme: "PERCENTAGE",
      payoutValue: "40.5",
    });
    expect(updateBarberSchema.safeParse({ ...base, payoutScheme: "NONE", payoutValue: "abc" }).data?.payoutValue).toBe("0");
    expect(updateBarberSchema.safeParse({ ...base, payoutScheme: "FIXED_RENT", payoutValue: "120000" }).success).toBe(true);
  });

  it.each(["101", "-1", "abc", ""])("rechaza PERCENTAGE %j en payoutValue", (payoutValue) => {
    const r = updateBarberSchema.safeParse({ ...base, payoutScheme: "PERCENTAGE", payoutValue });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["payoutValue"]);
  });

  it("rechaza nombre vacío y esquema desconocido", () => {
    expect(updateBarberSchema.safeParse({ ...base, name: "", payoutScheme: "NONE" }).success).toBe(false);
    expect(updateBarberSchema.safeParse({ ...base, payoutScheme: "OTHER" }).success).toBe(false);
  });
});

describe("choosePasswordSchema", () => {
  it("acepta 8–200 caracteres con confirmación igual", () => {
    expect(choosePasswordSchema.safeParse({ password: "12345678", confirmPassword: "12345678" }).success).toBe(true);
    const long = "x".repeat(200);
    expect(choosePasswordSchema.safeParse({ password: long, confirmPassword: long }).success).toBe(true);
  });

  it("rechaza contraseña corta o demasiado larga", () => {
    const r = choosePasswordSchema.safeParse({ password: "1234567", confirmPassword: "1234567" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["password"]);
    const long = "x".repeat(201);
    expect(choosePasswordSchema.safeParse({ password: long, confirmPassword: long }).success).toBe(false);
  });

  it("rechaza confirmación distinta", () => {
    const r = choosePasswordSchema.safeParse({ password: "12345678", confirmPassword: "12345679" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["confirmPassword"]);
  });
});

describe("changePasswordSchema", () => {
  const ok = { currentPassword: "vieja", newPassword: "nueva-segura", confirmPassword: "nueva-segura" };

  it("acepta actual + nueva + confirmación", () => {
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
  });

  it("rechaza actual vacía, nueva corta y confirmación distinta", () => {
    expect(changePasswordSchema.safeParse({ ...ok, currentPassword: "" }).error?.issues[0].path).toEqual([
      "currentPassword",
    ]);
    expect(
      changePasswordSchema.safeParse({ ...ok, newPassword: "corta", confirmPassword: "corta" }).error?.issues[0].path,
    ).toEqual(["newPassword"]);
    expect(changePasswordSchema.safeParse({ ...ok, confirmPassword: "otra-cosa" }).error?.issues[0].path).toEqual([
      "confirmPassword",
    ]);
  });
});

describe("barberAccessStatus", () => {
  it("sin contraseña → pendiente; con contraseña → activo", () => {
    expect(barberAccessStatus({ passwordHash: null })).toBe("PENDING");
    expect(barberAccessStatus({ passwordHash: "scrypt$a$b" })).toBe("ACTIVE");
  });
});
