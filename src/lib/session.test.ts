import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { signAdminSession } from "./admin-session";
import { getSessionSecret, signSession, verifySession } from "./session";

const secret = new TextEncoder().encode("test-secret-de-al-menos-32-caracteres!!");
const otherSecret = new TextEncoder().encode("otro-secret-distinto-de-32-caracteres!!");
const base = { userId: "u1", barbershopId: "b1", role: "OWNER" as const };

describe("session", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("un token firmado se verifica y devuelve el payload", async () => {
    const token = await signSession(base, secret);
    const payload = await verifySession(token, secret);
    expect(payload).toMatchObject(base);
    expect(payload?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("un token alterado devuelve null", async () => {
    const token = await signSession(base, secret);
    const [header, body, signature] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), barbershopId: "b2" }),
    ).toString("base64url");
    expect(await verifySession(`${header}.${forgedBody}.${signature}`, secret)).toBeNull();
    const flipped = signature.slice(0, -2) + (signature.endsWith("AA") ? "BB" : "AA");
    expect(await verifySession(`${header}.${body}.${flipped}`, secret)).toBeNull();
    expect(await verifySession("basura", secret)).toBeNull();
    expect(await verifySession(undefined, secret)).toBeNull();
  });

  it("un token vencido devuelve null", async () => {
    const token = await signSession({ ...base, expiresAt: Date.now() - 1000 }, secret);
    expect(await verifySession(token, secret)).toBeNull();
  });

  it("un token firmado con otro secreto devuelve null", async () => {
    const token = await signSession(base, otherSecret);
    expect(await verifySession(token, secret)).toBeNull();
  });

  it("un token de admin de la plataforma (audience platform-admin) no pasa verifySession", async () => {
    expect(await verifySession(await signAdminSession({ adminId: "a1" }, secret), secret)).toBeNull();
  });

  it("un token con payload de barbería pero con audience platform-admin se rechaza", async () => {
    const expiresAt = Date.now() + 60_000;
    const token = await new SignJWT({ ...base, expiresAt })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("platform-admin")
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(secret);
    expect(await verifySession(token, secret)).toBeNull();
  });

  it("falla con un error claro si falta SESSION_SECRET", () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => getSessionSecret()).toThrow(/SESSION_SECRET/);
  });
});
