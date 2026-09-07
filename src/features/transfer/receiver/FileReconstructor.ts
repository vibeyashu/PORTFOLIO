import type { TransferManifest } from '../../../types/transfer';
import { sha256Hex } from '../protocol/Checksum';
import { decompress } from '../compression/Compression';
import { decryptWithPassword, DecryptionError } from '../encryption/Encryption';

export interface ReconstructionResult {
  integrityVerified: boolean;
  manifest: TransferManifest;
  bytes: Uint8Array;
  text?: string;
}

export class ReconstructionNeedsPasswordError extends Error {}

export async function reconstructFile(
  manifest: TransferManifest,
  processedBytes: Uint8Array,
  password?: string,
): Promise<ReconstructionResult> {
  // 1. Verify integrity of the exact bytes that were transmitted, before doing
  //    anything else to them — this is the only way to know the QR scan itself
  //    was lossless. A failure here means the file is NOT safe to open.
  const actualHash = await sha256Hex(processedBytes);
  const integrityVerified = actualHash === manifest.sha256;

  let working = processedBytes;

  if (manifest.encryption === 'aes-gcm') {
    if (!password) throw new ReconstructionNeedsPasswordError('This transfer is encrypted and requires a password.');
    try {
      working = await decryptWithPassword(working, password);
    } catch (err) {
      if (err instanceof DecryptionError) throw err;
      throw new DecryptionError('Failed to decrypt payload');
    }
  }

  if (manifest.compression === 'deflate') {
    working = decompress(working);
  }

  const result: ReconstructionResult = { integrityVerified, manifest, bytes: working };
  if (manifest.kind === 'text') {
    result.text = new TextDecoder().decode(working);
  }
  return result;
}
