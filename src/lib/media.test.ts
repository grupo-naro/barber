import { describe, expect, it } from "vitest";
import {
  MAX_GALLERY_IMAGES,
  MAX_UPLOAD_BYTES,
  detectImageType,
  fitWithin,
  mediaKeyFromUrl,
  mediaKeyType,
  mediaUrl,
  parseMediaKey,
  parseMediaPath,
} from "./media";

const SHOP = "cmabc123def456ghi789jkl0"; // 24 chars, formato cuid
const FILE = "0123456789abcdef0123456789abcdef";

function bytes(...values: number[]) {
  return new Uint8Array(values);
}
function ascii(text: string) {
  return new TextEncoder().encode(text);
}

describe("media: detectImageType", () => {
  it("detecta JPEG, PNG y WebP por magic bytes", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("jpg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("png");
    const webp = new Uint8Array([...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBPVP8 ")]);
    expect(detectImageType(webp)).toBe("webp");
  });

  it("rechaza SVG, GIF, HTML, RIFF que no es WebP, vacíos y truncados", () => {
    expect(detectImageType(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectImageType(ascii("GIF89a......"))).toBeNull();
    expect(detectImageType(ascii("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(detectImageType(new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")]))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(detectImageType(ascii("RIFF\0\0\0\0WEB"))).toBeNull();
  });

  it("constantes", () => {
    expect(MAX_UPLOAD_BYTES).toBe(3 * 1024 * 1024);
    expect(MAX_GALLERY_IMAGES).toBe(24);
  });
});

describe("media: parseMediaPath", () => {
  it("acepta exactamente <id>/<32 hex>.<jpg|png|webp>", () => {
    for (const ext of ["jpg", "png", "webp"]) {
      expect(parseMediaPath([SHOP, `${FILE}.${ext}`])).toBe(`${SHOP}/${FILE}.${ext}`);
    }
  });

  it.each([
    [[".."]],
    [["..", ".env"]],
    [["%2e%2e", "x.jpg"]],
    [[SHOP, "..%2f..%2f.env"]],
    [[SHOP, `..\\${FILE}.jpg`]],
    [[`${SHOP}\\..`, `${FILE}.jpg`]],
    [["a", "b", "c.jpg"]],
    [[SHOP, `${FILE}.jpg`, "extra"]],
    [[SHOP]],
    [[]],
    [[SHOP, `${FILE}.svg`]],
    [[SHOP, `${FILE}.gif`]],
    [[SHOP, `${FILE}.html`]],
    [[SHOP, `${FILE}.JPG`]],
    [[SHOP, `${FILE}.jpg.html`]],
    [[SHOP, "x.jpg"]],
    [[SHOP, `${FILE.toUpperCase()}.jpg`]],
    [["SHOPCONMAYUSCULAS123456", `${FILE}.jpg`]],
    [["corto", `${FILE}.jpg`]],
    [[SHOP, `${FILE}a.jpg`]],
  ])("rechaza %j", (segments) => {
    expect(parseMediaPath(segments)).toBeNull();
  });

  it("parseMediaKey / mediaKeyType / mediaUrl", () => {
    const key = `${SHOP}/${FILE}.webp`;
    expect(parseMediaKey(key)).toBe(key);
    expect(parseMediaKey(`${SHOP}/../${FILE}.webp`)).toBeNull();
    expect(parseMediaKey(`/${key}`)).toBeNull();
    expect(mediaKeyType(key)).toBe("webp");
    expect(mediaKeyType("nope")).toBeNull();
    expect(mediaUrl(key)).toBe(`/media/${key}`);
  });
});

describe("media: mediaKeyFromUrl", () => {
  const key = `${SHOP}/${FILE}.png`;
  it("devuelve la key solo si es /media/ de esa barbería", () => {
    expect(mediaKeyFromUrl(`/media/${key}`, SHOP)).toBe(key);
    expect(mediaKeyFromUrl(`/media/${key}`, "otrabarberia1234567890ab")).toBeNull();
    expect(mediaKeyFromUrl(`https://example.com/media/${key}`, SHOP)).toBeNull();
    expect(mediaKeyFromUrl("https://example.com/logo.png", SHOP)).toBeNull();
    expect(mediaKeyFromUrl(`/media/${SHOP}/../x.png`, SHOP)).toBeNull();
    expect(mediaKeyFromUrl(null, SHOP)).toBeNull();
  });
});

describe("media: fitWithin", () => {
  it("achica manteniendo la proporción", () => {
    expect(fitWithin(3200, 2400, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
    expect(fitWithin(1601, 1601, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("nunca agranda", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it("no devuelve dimensiones en cero", () => {
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });
});
