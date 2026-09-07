// Optional end-to-end encryption using the browser's native Web Crypto API.
// No custom cryptography: standard AES-256-GCM with a PBKDF2-derived key.
// The key/password never leaves the device and is never transmitted over
// the network (there is no network) — it must be shared out-of-band
// (spoken, typed, or a separately-scanned pairing code).

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBuf(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBuf(u: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u.byteLength);
  new Uint8Array(buf).set(u);
  return buf;
}

/** Output layout: [salt(16)][iv(12)][ciphertext...] — self-contained, no side channel needed except the password. */
export async function encryptWithPassword(data: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toBuf(iv) }, key, toBuf(data)),
  );
  const out = new Uint8Array(SALT_BYTES + IV_BYTES + ciphertext.length);
  out.set(salt, 0);
  out.set(iv, SALT_BYTES);
  out.set(ciphertext, SALT_BYTES + IV_BYTES);
  return out;
}

export class DecryptionError extends Error {}

export async function decryptWithPassword(data: Uint8Array, password: string): Promise<Uint8Array> {
  if (data.length < SALT_BYTES + IV_BYTES) {
    throw new DecryptionError('Encrypted payload is too short to be valid');
  }
  const salt = data.subarray(0, SALT_BYTES);
  const iv = data.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const ciphertext = data.subarray(SALT_BYTES + IV_BYTES);
  const key = await deriveKey(password, salt);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toBuf(iv) }, key, toBuf(ciphertext));
    return new Uint8Array(plaintext);
  } catch {
    throw new DecryptionError('Wrong password or corrupted data');
  }
}

/** Generates a short numeric pairing code, e.g. for reading aloud between two devices. */
export function generatePairingCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}
