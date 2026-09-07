import * as pako from 'pako';

export interface CompressionResult {
  bytes: Uint8Array;
  usedCompression: boolean;
}

/**
 * Compresses with deflate only if it actually shrinks the payload.
 * Already-compressed formats (JPEG, most audio codecs) can end up *larger*
 * after deflate due to header overhead, so we measure and pick the smaller.
 */
export function compressIfBeneficial(bytes: Uint8Array): CompressionResult {
  try {
    const compressed = pako.deflate(bytes, { level: 9 });
    if (compressed.length < bytes.length) {
      return { bytes: compressed, usedCompression: true };
    }
  } catch {
    // fall through to uncompressed
  }
  return { bytes, usedCompression: false };
}

export function decompress(bytes: Uint8Array): Uint8Array {
  return pako.inflate(bytes);
}
