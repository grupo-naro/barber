import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Formato del hash: "scrypt$<saltHex>$<keyHex>". Sin dependencias externas.
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const PREFIX = "scrypt";

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Hashea una contraseña con scrypt y un salt aleatorio. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt);
  return `${PREFIX}$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Compara en tiempo constante. Devuelve `false` (nunca lanza) si el hash está malformado. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const [, saltHex, keyHex] = parts;
  const hexRe = /^[0-9a-f]+$/i;
  if (!hexRe.test(saltHex) || !hexRe.test(keyHex) || keyHex.length !== KEY_LENGTH * 2) return false;

  const expected = Buffer.from(keyHex, "hex");
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
