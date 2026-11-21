import { describe, expect, it } from "vitest";
import {
  galleryAltSchema,
  galleryMoveSchema,
  instagramUrl,
  isGoogleMapsUrl,
  mapsSearchUrl,
  normalizeInstagram,
  socialLinksSchema,
  whatsappUrl,
} from "./landing";

describe("landing: normalizeInstagram", () => {
  it.each([
    ["user", "user"],
    ["@user", "user"],
    ["  @barber.ok  ", "barber.ok"],
    ["instagram.com/user", "user"],
    ["www.instagram.com/user/", "user"],
    ["https://www.instagram.com/user/?hl=es", "user"],
    ["http://instagram.com/user_1", "user_1"],
    ["https://instagram.com/@user", "user"],
    ["a".repeat(30), "a".repeat(30)],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeInstagram(raw)).toBe(expected);
  });

  it.each([
    "",
    "@",
    "user name",
    "user!",
    "a".repeat(31),
    "https://evil.com/user",
    "https://instagram.com.evil.com/user",
    "https://evil.com/instagram.com/user",
    "https://www.instagram.com/",
    "https://www.instagram.com/p/abc123",
    "javascript:alert(1)//instagram.com/user",
    "ftp://instagram.com/user",
    "https://user:pass@instagram.com/user",
  ])("rechaza %j", (raw) => {
    expect(normalizeInstagram(raw)).toBeNull();
  });

  it("instagramUrl", () => {
    expect(instagramUrl("barber.ok")).toBe("https://www.instagram.com/barber.ok/");
  });
});

describe("landing: isGoogleMapsUrl", () => {
  it.each([
    "https://www.google.com/maps/place/Barber%C3%ADa/@-34.6,-58.4,17z",
    "https://google.com/maps?q=-34.6,-58.4",
    "https://maps.google.com/?q=Av+Corrientes+1234",
    "https://maps.app.goo.gl/AbCdEf123",
    "https://goo.gl/maps/AbCdEf123",
    "https://www.google.com/maps",
  ])("acepta %s", (url) => {
    expect(isGoogleMapsUrl(url)).toBe(true);
  });

  it.each([
    "http://www.google.com/maps/place/x",
    "javascript:alert(1)",
    "https://evil.com/?google.com",
    "https://evil.com/maps",
    "https://google.com.evil.com/maps",
    "https://www.google.com/search?q=barberia",
    "https://www.google.com/mapsevil",
    "https://goo.gl/abc",
    "https://user@www.google.com/maps",
    "https://www.google.com:8443/maps",
    "www.google.com/maps",
    "",
  ])("rechaza %j", (url) => {
    expect(isGoogleMapsUrl(url)).toBe(false);
  });
});

describe("landing: links derivados", () => {
  it("mapsSearchUrl codifica la dirección", () => {
    expect(mapsSearchUrl("Av. Corrientes 1234, CABA")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Av.%20Corrientes%201234%2C%20CABA",
    );
    expect(mapsSearchUrl("a&b=c#d")).toBe("https://www.google.com/maps/search/?api=1&query=a%26b%3Dc%23d");
  });

  it("whatsappUrl deja solo dígitos", () => {
    expect(whatsappUrl("+5491112345678")).toBe("https://wa.me/5491112345678");
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl("")).toBeNull();
  });
});

describe("landing: socialLinksSchema", () => {
  it("normaliza instagram y acepta maps válido", () => {
    const r = socialLinksSchema.safeParse({
      instagram: "@barber.ok",
      googleMapsUrl: " https://maps.app.goo.gl/AbC ",
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ instagram: "barber.ok", googleMapsUrl: "https://maps.app.goo.gl/AbC" });
  });

  it("vacío → null", () => {
    expect(socialLinksSchema.safeParse({ instagram: "  ", googleMapsUrl: "" }).data).toEqual({
      instagram: null,
      googleMapsUrl: null,
    });
    expect(socialLinksSchema.safeParse({}).data).toEqual({ instagram: null, googleMapsUrl: null });
  });

  it("errores por campo en español", () => {
    const r = socialLinksSchema.safeParse({ instagram: "no válido!", googleMapsUrl: "https://evil.com/?google.com" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(["instagram", "googleMapsUrl"]);
    expect(r.error!.issues[0].message).toContain("Instagram");
    expect(r.error!.issues[1].message).toContain("Google Maps");
  });

  it("rechaza links de maps demasiado largos", () => {
    const r = socialLinksSchema.safeParse({ googleMapsUrl: `https://maps.app.goo.gl/${"a".repeat(2100)}` });
    expect(r.success).toBe(false);
  });
});

describe("landing: galería", () => {
  it("alt opcional de hasta 150 caracteres", () => {
    expect(galleryAltSchema.safeParse({ id: "x", alt: "  " }).data).toEqual({ id: "x", alt: null });
    expect(galleryAltSchema.safeParse({ id: "x", alt: "a".repeat(150) }).success).toBe(true);
    const r = galleryAltSchema.safeParse({ id: "x", alt: "a".repeat(151) });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path).toEqual(["alt"]);
  });

  it("move solo up/down", () => {
    expect(galleryMoveSchema.safeParse({ id: "x", direction: "up" }).success).toBe(true);
    expect(galleryMoveSchema.safeParse({ id: "x", direction: "left" }).success).toBe(false);
    expect(galleryMoveSchema.safeParse({ id: "", direction: "down" }).success).toBe(false);
  });
});
