// SHA-256 via the browser's native Web Crypto API (used for whole-file
// integrity) and a small CRC32 implementation (used per-packet, since
// spinning up SHA-256 for every single QR frame would be wasteful).

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  return buf;
}

let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/** Returns a compact base36 CRC32 checksum string, small enough to keep QR payloads tight. */
export function crc32Base36(bytes: Uint8Array): string {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  const result = (crc ^ 0xffffffff) >>> 0;
  return result.toString(36);
}

export function crc32BaseFromString(s: string): string {
  return crc32Base36(new TextEncoder().encode(s));
}
