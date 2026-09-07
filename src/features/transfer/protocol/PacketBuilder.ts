import type { PayloadKind, TransferManifest } from '../../../types/transfer';
import { chunkBytes, generateParityChunks } from './Fec';
import { encodeDataPacket, encodeManifestPacket } from './Encoding';
import { sha256Hex } from './Checksum';
import { generateSessionId } from './Session';

export const FEC_GROUP_SIZE = 8;

export interface BuiltTransfer {
  sessionId: string;
  manifest: TransferManifest;
  manifestFrame: string;
  dataFrames: string[]; // wire strings, index-aligned with data packets
  parityFrames: string[]; // wire strings, index-aligned with parity groups
}

export interface BuildTransferInput {
  processedBytes: Uint8Array;
  kind: PayloadKind;
  fileName: string;
  mimeType: string;
  originalSize: number;
  compression: 'deflate' | 'none';
  encryption: 'aes-gcm' | 'none';
  chunkBytes: number;
}

export async function buildTransfer(input: BuildTransferInput): Promise<BuiltTransfer> {
  const sessionId = generateSessionId();
  const dataChunks = chunkBytes(input.processedBytes, input.chunkBytes);
  const parityChunks = generateParityChunks(dataChunks, FEC_GROUP_SIZE);
  const sha256 = await sha256Hex(input.processedBytes);

  const compressionCode = input.compression === 'deflate' ? 'd' : 'n';
  const encryptionCode = input.encryption === 'aes-gcm' ? 'a' : 'n';

  const manifest: TransferManifest = {
    version: 1,
    sessionId,
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    originalSize: input.originalSize,
    processedSize: input.processedBytes.length,
    totalPackets: dataChunks.length,
    parityPackets: parityChunks.length,
    compression: input.compression,
    encryption: input.encryption,
    sha256,
    createdAt: Date.now(),
  };

  const dataFrames = dataChunks.map((chunk, index) =>
    encodeDataPacket({
      sessionId,
      kind: input.kind,
      index,
      total: dataChunks.length,
      groupSize: FEC_GROUP_SIZE,
      compression: compressionCode,
      encryption: encryptionCode,
      data: chunk,
      isParity: false,
    }),
  );

  const parityFrames = parityChunks.map((chunk, groupIndex) =>
    encodeDataPacket({
      sessionId,
      kind: input.kind,
      index: groupIndex,
      total: dataChunks.length,
      groupSize: FEC_GROUP_SIZE,
      compression: compressionCode,
      encryption: encryptionCode,
      data: chunk,
      isParity: true,
    }),
  );

  const manifestFrame = encodeManifestPacket(sessionId, manifest);

  return { sessionId, manifest, manifestFrame, dataFrames, parityFrames };
}
