import { xorBytes } from '../../../utils/bytes';

/**
 * Simple, real, and cheap forward-error-correction scheme: data chunks are
 * split into fixed-size groups, and one XOR parity chunk is generated per
 * group (parity = chunk0 XOR chunk1 XOR ... XOR chunkG-1, zero-padded to
 * equal length). If a receiver is missing exactly one chunk from a group
 * but has the rest plus the parity chunk, it can recover the missing chunk
 * by XOR-ing everything else together.
 *
 * This is deliberately not a full Raptor/LT fountain code (that's a lot of
 * math for marginal benefit in a browser QR-optical link) but it captures
 * the same core idea in a form that's easy to reason about and test, and it
 * meaningfully increases the odds of a full recovery on a single scan pass.
 */

export function chunkBytes(data: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const slice = data.subarray(offset, offset + chunkSize);
    if (slice.length === chunkSize) {
      chunks.push(slice);
    } else {
      // pad the final chunk with zeros so all chunks are equal length for XOR
      const padded = new Uint8Array(chunkSize);
      padded.set(slice);
      chunks.push(padded);
    }
  }
  return chunks.length > 0 ? chunks : [new Uint8Array(chunkSize)];
}

export function generateParityChunks(dataChunks: Uint8Array[], groupSize: number): Uint8Array[] {
  const parity: Uint8Array[] = [];
  for (let g = 0; g < dataChunks.length; g += groupSize) {
    const group = dataChunks.slice(g, g + groupSize);
    parity.push(group.reduce((acc, c) => xorBytes(acc, c), new Uint8Array(group[0].length)));
  }
  return parity;
}

/**
 * Attempts to recover any single-missing-chunk-per-group cases.
 * `dataChunks` and `parityChunks` are sparse maps (index -> chunk | undefined).
 * Mutates nothing; returns newly recovered entries as { index, chunk } pairs.
 */
export function recoverMissingChunks(
  totalDataChunks: number,
  groupSize: number,
  dataChunks: Map<number, Uint8Array>,
  parityChunks: Map<number, Uint8Array>,
): Array<{ index: number; chunk: Uint8Array }> {
  const recovered: Array<{ index: number; chunk: Uint8Array }> = [];
  const groupCount = Math.ceil(totalDataChunks / groupSize);

  for (let g = 0; g < groupCount; g++) {
    const start = g * groupSize;
    const end = Math.min(start + groupSize, totalDataChunks);
    const groupIndices = Array.from({ length: end - start }, (_, k) => start + k);
    const missing = groupIndices.filter((idx) => !dataChunks.has(idx));

    if (missing.length === 1 && parityChunks.has(g)) {
      const missingIndex = missing[0];
      let acc = parityChunks.get(g)!;
      for (const idx of groupIndices) {
        if (idx === missingIndex) continue;
        acc = xorBytes(acc, dataChunks.get(idx)!);
      }
      recovered.push({ index: missingIndex, chunk: acc });
    }
  }
  return recovered;
}
