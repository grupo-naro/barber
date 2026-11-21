import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  INVITATION_TTL_MS,
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  invitationPath,
  isInvitationUsable,
  isPlausibleInvitationToken,
  whatsappInviteUrl,
} from "./invitations";

describe("invitations: token", () => {
  it("genera tokens base64url de 256 bits (43 caracteres sin padding)", () => {
    const token = generateInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(isPlausibleInvitationToken(token)).toBe(true);
  });

  it("dos tokens nunca se repiten", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateInvitationToken()));
    expect(tokens.size).toBe(1000);
  });

  it("el hash es sha256 hex, determinístico y distinto del token", async () => {
    const token = generateInvitationToken();
    const hash = await hashInvitationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashInvitationToken(token)).toBe(hash);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
    expect(await hashInvitationToken(generateInvitationToken())).not.toBe(hash);
  });

  it("rechaza tokens con forma imposible antes de ir a la DB", () => {
    expect(isPlausibleInvitationToken("")).toBe(false);
    expect(isPlausibleInvitationToken("a".repeat(129))).toBe(false);
    expect(isPlausibleInvitationToken("abc/../x")).toBe(false);
    expect(isPlausibleInvitationToken("abc def")).toBe(false);
  });

  it("arma el path público", () => {
    expect(invitationPath("abc_-1")).toBe("/invitacion/abc_-1");
  });
});

describe("invitations: vencimiento y uso", () => {
  const now = new Date("2026-11-21T12:00:00.000Z");

  it("vence a las 48 h", () => {
    expect(invitationExpiresAt(now).toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(INVITATION_TTL_MS).toBe(48 * 60 * 60 * 1000);
  });

  it("es usable hasta un milisegundo antes del vencimiento y vencida justo en el borde", () => {
    const expiresAt = invitationExpiresAt(now);
    expect(isInvitationUsable({ expiresAt, usedAt: null }, now)).toBe(true);
    expect(isInvitationUsable({ expiresAt, usedAt: null }, new Date(expiresAt.getTime() - 1))).toBe(true);
    expect(isInvitationUsable({ expiresAt, usedAt: null }, expiresAt)).toBe(false);
    expect(isInvitationUsable({ expiresAt, usedAt: null }, new Date(expiresAt.getTime() + 1))).toBe(false);
  });

  it("usada → no usable aunque no haya vencido", () => {
    expect(isInvitationUsable({ expiresAt: invitationExpiresAt(now), usedAt: now }, now)).toBe(false);
  });
});

describe("invitations: link de WhatsApp", () => {
  it("usa wa.me sin teléfono y el texto sale codificado con la barbería y el link", () => {
    const link = "https://app.test/invitacion/abc_-123";
    const url = whatsappInviteUrl("Barbería Don José & Hijos", link);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    const encoded = url.slice("https://wa.me/?text=".length);
    expect(encoded).not.toMatch(/[ &?#/:]/);
    const text = decodeURIComponent(encoded);
    expect(text).toContain("Barbería Don José & Hijos");
    expect(text).toContain(link);
    expect(new URL(url).searchParams.get("text")).toBe(text);
  });
});
