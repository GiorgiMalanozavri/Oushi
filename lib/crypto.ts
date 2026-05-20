import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/**
 * Symmetric encryption for sensitive fields (Gmail refresh tokens, etc).
 * Uses AES-256-GCM with a server-only key from env. The output format is:
 *   "enc:v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>"
 *
 * Reads accept either the "enc:v1:..." format or raw plaintext (so existing
 * tokens keep working until they're backfilled — see /api/admin/encrypt-tokens).
 */

const ALG = "aes-256-gcm";
const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY env var is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  // Accept either base64 (44 chars), hex (64 chars), or any string we hash to 32 bytes.
  if (raw.length === 44 || raw.length === 43) {
    try {
      const buf = Buffer.from(raw, "base64");
      if (buf.length === 32) return buf;
    } catch {
      // fall through
    }
  }
  if (raw.length === 64 && /^[0-9a-f]+$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  // Fallback: SHA-256 hash whatever we got to derive a stable 32-byte key
  return createHash("sha256").update(raw).digest();
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  // Already encrypted? leave it alone
  if (plaintext.startsWith(PREFIX)) return plaintext;

  const iv = randomBytes(12); // GCM standard nonce
  const cipher = createCipheriv(ALG, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    PREFIX.slice(0, -1), // "enc:v1"
    iv.toString("base64"),
    authTag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

export function decrypt(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith(PREFIX)) {
    // Treat as plaintext (legacy / not-yet-encrypted)
    return value;
  }
  const parts = value.split(":");
  // parts = ["enc", "v1", iv, authTag, ciphertext]
  if (parts.length < 5) return value; // malformed — return as-is
  const iv = Buffer.from(parts[2], "base64");
  const authTag = Buffer.from(parts[3], "base64");
  const ciphertext = Buffer.from(parts[4], "base64");
  const decipher = createDecipheriv(ALG, getKey(), iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * Whether the value is already in our encrypted format.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}
