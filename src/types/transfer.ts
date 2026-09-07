// Core domain types for QRMesh Advanced

export type AppMode = 'home' | 'send' | 'receive';

export type PayloadKind = 'text' | 'image' | 'pdf' | 'audio' | 'file';

/** Packet format version. Bump when the wire format changes incompatibly. */
export const PROTOCOL_VERSION = 1;

/**
 * The logical header carried by every packet. Kept intentionally small:
 * every byte here is a byte the QR code has to encode, so field names
 * are single letters on the wire (see Encoding.ts) but named properly
 * in code for readability.
 */
export interface PacketHeader {
  /** protocol version */
  v: number;
  /** short session id, unique per transfer, prevents cross-talk */
  s: string;
  /** zero-based packet index */
  i: number;
  /** total number of *data* packets (excludes parity packets) */
  n: number;
  /** payload kind */
  k: PayloadKind;
  /** true if this packet is a parity/redundancy packet */
  p: boolean;
  /** compression used on the overall payload: 'd' = deflate, 'n' = none */
  c: 'd' | 'n';
  /** encryption used: 'a' = AES-GCM, 'n' = none */
  e: 'a' | 'n';
}

export interface Packet extends PacketHeader {
  /** base64url chunk of the (compressed, possibly encrypted) payload */
  d: string;
  /** CRC32 checksum (base36) of this packet's `d` field, for per-packet corruption detection */
  x: string;
}

/** Metadata describing the whole transfer, sent redundantly inside packet 0 and re-broadcast. */
export interface TransferManifest {
  version: number;
  sessionId: string;
  kind: PayloadKind;
  fileName: string;
  mimeType: string;
  originalSize: number;
  processedSize: number;
  totalPackets: number;
  parityPackets: number;
  compression: 'deflate' | 'none';
  encryption: 'aes-gcm' | 'none';
  /** SHA-256 hex digest of the processed (compressed+encrypted) binary payload */
  sha256: string;
  createdAt: number;
}

export type TransmissionState =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'transmitting'
  | 'paused'
  | 'completed'
  | 'failed';

export type ReceptionState =
  | 'idle'
  | 'scanning'
  | 'receiving'
  | 'reconstructing'
  | 'verifying'
  | 'completed'
  | 'failed';

export type QualityPreset = 'reliable' | 'balanced' | 'fast';

export interface QrSettings {
  preset: QualityPreset;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  moduleCount: 1 | 4; // 1 = single QR, 4 = 2x2 grid
  fps: number;
  chunkBytes: number;
  qrPixelSize: number;
}

export interface ImageProcessingOptions {
  preset: 'maximum' | 'balanced' | 'fast';
  maxDimension: number;
  jpegQuality: number;
}

export interface AudioProcessingOptions {
  preset: 'original' | 'compressed' | 'voice';
  sampleRate: number;
  mono: boolean;
}

export interface AppError {
  code: string;
  message: string;
  suggestion: string;
  retryable: boolean;
}

export interface TransferHistoryEntry {
  id: string;
  sessionId: string;
  direction: 'sent' | 'received';
  fileName: string;
  kind: PayloadKind;
  mimeType: string;
  size: number;
  status: 'completed' | 'failed';
  timestamp: number;
}
