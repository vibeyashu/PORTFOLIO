import type { QrSettings, QualityPreset } from '../../../types/transfer';

export const QR_PRESETS: Record<QualityPreset, QrSettings> = {
  reliable: {
    preset: 'reliable',
    errorCorrectionLevel: 'H',
    moduleCount: 1,
    fps: 4,
    chunkBytes: 90,
    qrPixelSize: 340,
  },
  balanced: {
    preset: 'balanced',
    errorCorrectionLevel: 'M',
    moduleCount: 1,
    fps: 8,
    chunkBytes: 160,
    qrPixelSize: 320,
  },
  fast: {
    preset: 'fast',
    errorCorrectionLevel: 'L',
    moduleCount: 1,
    fps: 12,
    chunkBytes: 240,
    qrPixelSize: 320,
  },
};

export interface TransferEstimate {
  processedBytes: number;
  totalDataPackets: number;
  parityPackets: number;
  totalFramesPerCycle: number;
  estimatedSeconds: number;
  framesToShowAllOnce: number;
}

/** Rough real-world multiplier: camera scans rarely catch every single frame, so we
 * budget ~1.6x the "show every frame once" time as a realistic full-transfer estimate. */
const REAL_WORLD_SCAN_FACTOR = 1.6;

export function estimateTransfer(processedBytes: number, settings: QrSettings, groupSize = 8): TransferEstimate {
  const totalDataPackets = Math.max(1, Math.ceil(processedBytes / settings.chunkBytes));
  const parityPackets = Math.ceil(totalDataPackets / groupSize);
  const framesPerQrSlot = settings.moduleCount; // 2x2 mode shows `moduleCount` packets per screen refresh
  const totalFramesPerCycle = Math.ceil((totalDataPackets + parityPackets + 1) / framesPerQrSlot); // +1 for manifest
  const framesToShowAllOnce = totalFramesPerCycle;
  const estimatedSeconds = (totalFramesPerCycle / settings.fps) * REAL_WORLD_SCAN_FACTOR;

  return {
    processedBytes,
    totalDataPackets,
    parityPackets,
    totalFramesPerCycle,
    estimatedSeconds,
    framesToShowAllOnce,
  };
}

/**
 * Recommends a preset from processed payload size alone. Small payloads (text,
 * thumbnails) can afford the slow/reliable settings since they finish in seconds
 * regardless; larger payloads need density and speed to stay usable.
 */
export function recommendPreset(processedBytes: number): QualityPreset {
  if (processedBytes < 2_000) return 'reliable';
  if (processedBytes < 30_000) return 'balanced';
  return 'fast';
}
