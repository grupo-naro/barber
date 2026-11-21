import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import {
  ADMIN_AUDIENCE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_DURATION_MS,
  adminSessionCookieOptions,
  signAdminSession,
  verifyAdminSession,
} from "./admin-session";
import { SESSION_COOKIE, signSession, verifySession } from "./session";

const secret = new TextEncoder().encode("test-secret-de-al-menos-32-caracteres!!");
const otherSecret = new TextEncoder().encode("otro-secret-distinto-de-32-caracteres!!");

describe("admin-session", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("un token de admin se verifica y devuelve adminId", async () => {
    const token = await signAdminSession({ adminId: "a1" }, secret);
    const payload = await verifyAdminSession(token, secret);
    expect(payload?.adminId).toBe("a1");
    expect(payload!.expiresAt).toBeGreaterThan(Date.now());
    expect(payload!.expiresAt).toBeLessThanOrEqual(Date.now() + ADMIN_SESSION_DURATION_MS);
  });

  it("lleva el audience platform-admin", async () => {
    const token = await signAdminSession({ adminId: "a1" }, secret);
    const body = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(body.aud).toBe(ADMIN_AUDIENCE);
  });

  it("un token de barbería (OWNER) no pasa verifyAdminSession", async () => {
    const token = await signSession({ userId: "u1", barbershopId: "b1", role: "OWNER" }, secret);
    expect(await verifySession(token, secret)).not.toBeNull();
    expect(await verifyAdminSession(token, secret)).toBeNull();
  });

  it("un token de admin no pasa verifySession", async () => {
    const token = await signAdminSession({ adminId: "a1" }, secret);
    expect(await verifySession(token, secret)).toBeNull();
  });

  it("un token con adminId pero sin el audience no pasa", async () => {
    const token = await new SignJWT({ adminId: "a1", expiresAt: Date.now() + 60_000 })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1m")
      .sign(secret);
    expect(await verifyAdminSession(token, secret)).toBeNull();
    const otherAud = await new SignJWT({ adminId: "a1", expiresAt: Date.now() + 60_000 })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("otra-cosa")
      .setExpirationTime("1m")
      .sign(secret);
    expect(await verifyAdminSession(otherAud, secret)).toBeNull();
  });

  it("vencido, otra firma, alterado o vacío → null", async () => {
    expect(await verifyAdminSession(await signAdminSession({ adminId: "a1", expiresAt: Date.now() - 1000 }, secret), secret)).toBeNull();
    expect(await verifyAdminSession(await signAdminSession({ adminId: "a1" }, otherSecret), secret)).toBeNull();
    const token = await signAdminSession({ adminId: "a1" }, secret);
    const [h, b, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(b, "base64url").toString()), adminId: "a2" })).toString("base64url");
    expect(await verifyAdminSession(`${h}.${forged}.${s}`, secret)).toBeNull();
    expect(await verifyAdminSession("basura", secret)).toBeNull();
    expect(await verifyAdminSession(undefined, secret)).toBeNull();
  });

  it("cookie admin_session: httpOnly, strict, path /, secure en producción, 12 h", () => {
    expect(ADMIN_SESSION_COOKIE).toBe("admin_session");
    expect(ADMIN_SESSION_COOKIE).not.toBe(SESSION_COOKIE);
    expect(ADMIN_SESSION_DURATION_MS).toBe(12 * 60 * 60 * 1000);
    const expiresAt = Date.now() + ADMIN_SESSION_DURATION_MS;
    vi.stubEnv("NODE_ENV", "production");
    expect(adminSessionCookieOptions(expiresAt)).toEqual({
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      expires: new Date(expiresAt),
    });
    vi.stubEnv("NODE_ENV", "development");
    expect(adminSessionCookieOptions(expiresAt).secure).toBe(false);
  });
});
