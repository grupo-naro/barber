import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMpSignature } from "@/lib/mercadopago-signature";

const SECRET = "test-webhook-secret";
const TS = "1742505638683";
const REQUEST_ID = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";
const DATA_ID = "123456";

// Manifiesto confirmado en la doc de MP: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
function sign(manifest: string, secret = SECRET) {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

const validV1 = sign(`id:${DATA_ID};request-id:${REQUEST_ID};ts:${TS};`);
const base = { xSignature: `ts=${TS},v1=${validV1}`, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET };

function flipFirstByte(hex: string) {
  const first = (parseInt(hex.slice(0, 2), 16) ^ 0x01).toString(16).padStart(2, "0");
  return first + hex.slice(2);
}

describe("verifyMpSignature", () => {
  it("acepta una firma válida", () => {
    expect(verifyMpSignature(base)).toBe(true);
  });

  it("tolera espacios alrededor de las partes del header", () => {
    expect(verifyMpSignature({ ...base, xSignature: ` ts=${TS} , v1=${validV1} ` })).toBe(true);
  });

  it("pasa a minúsculas un data.id alfanumérico", () => {
    const v1 = sign(`id:abc123;request-id:${REQUEST_ID};ts:${TS};`);
    expect(verifyMpSignature({ ...base, dataId: "ABC123", xSignature: `ts=${TS},v1=${v1}` })).toBe(true);
  });

  it("sin x-request-id o sin data.id, quita ese tramo del manifiesto", () => {
    const noReq = sign(`id:${DATA_ID};ts:${TS};`);
    expect(verifyMpSignature({ ...base, xRequestId: null, xSignature: `ts=${TS},v1=${noReq}` })).toBe(true);
    const noId = sign(`request-id:${REQUEST_ID};ts:${TS};`);
    expect(verifyMpSignature({ ...base, dataId: null, xSignature: `ts=${TS},v1=${noId}` })).toBe(true);
  });

  it("rechaza un byte cambiado en v1", () => {
    expect(verifyMpSignature({ ...base, xSignature: `ts=${TS},v1=${flipFirstByte(validV1)}` })).toBe(false);
  });

  it("rechaza sin header, sin ts o sin v1", () => {
    expect(verifyMpSignature({ ...base, xSignature: null })).toBe(false);
    expect(verifyMpSignature({ ...base, xSignature: "" })).toBe(false);
    expect(verifyMpSignature({ ...base, xSignature: `v1=${validV1}` })).toBe(false);
    expect(verifyMpSignature({ ...base, xSignature: `ts=${TS}` })).toBe(false);
    expect(verifyMpSignature({ ...base, xSignature: `ts=,v1=${validV1}` })).toBe(false);
  });

  it("rechaza con otro dataId, otro request-id, otro ts u otro secret", () => {
    expect(verifyMpSignature({ ...base, dataId: "654321" })).toBe(false);
    expect(verifyMpSignature({ ...base, xRequestId: "otro" })).toBe(false);
    expect(verifyMpSignature({ ...base, xSignature: `ts=1,v1=${validV1}` })).toBe(false);
    expect(verifyMpSignature({ ...base, secret: "otro-secreto" })).toBe(false);
    expect(verifyMpSignature({ ...base, secret: "" })).toBe(false);
  });

  it("con un v1 de largo distinto o no hex da false sin lanzar", () => {
    for (const v1 of [validV1.slice(0, 10), `${validV1}00`, validV1.slice(1), "zz".repeat(32)]) {
      expect(() => verifyMpSignature({ ...base, xSignature: `ts=${TS},v1=${v1}` })).not.toThrow();
      expect(verifyMpSignature({ ...base, xSignature: `ts=${TS},v1=${v1}` })).toBe(false);
    }
  });
});
