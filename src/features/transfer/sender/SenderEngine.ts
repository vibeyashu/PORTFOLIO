import type { AppError, PayloadKind, QrSettings, TransmissionState } from '../../../types/transfer';
import {
  AUDIO_PRESETS,
  IMAGE_PRESETS,
  detectKind,
  processAudio,
  processGenericFile,
  processImage,
  processText,
  type ProcessedFile,
} from './FileProcessor';
import { compressIfBeneficial } from '../compression/Compression';
import { encryptWithPassword } from '../encryption/Encryption';
import { buildTransfer, type BuiltTransfer } from '../protocol/PacketBuilder';
import { estimateTransfer, type TransferEstimate } from '../protocol/Estimator';
import { PacketScheduler } from './PacketScheduler';

export interface SenderSnapshot {
  state: TransmissionState;
  statusMessage: string;
  progressPct: number;
  processed?: ProcessedFile;
  built?: BuiltTransfer;
  estimate?: TransferEstimate;
  currentFrames: string[];
  packetPosition: number;
  cycleLength: number;
  error?: AppError;
}

export interface PrepareOptions {
  imagePreset: keyof typeof IMAGE_PRESETS;
  audioPreset: keyof typeof AUDIO_PRESETS;
  qrSettings: QrSettings;
  password?: string;
}

export type SenderListener = (snapshot: SenderSnapshot) => void;

function makeError(code: string, message: string, suggestion: string, retryable = true): AppError {
  return { code, message, suggestion, retryable };
}

export class SenderEngine {
  private snapshot: SenderSnapshot = {
    state: 'idle',
    statusMessage: 'Choose a file or type a message to begin.',
    progressPct: 0,
    currentFrames: [],
    packetPosition: 0,
    cycleLength: 0,
  };
  private scheduler: PacketScheduler | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<SenderListener>();

  subscribe(listener: SenderListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  private emit(partial: Partial<SenderSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const l of this.listeners) l(this.snapshot);
  }

  async prepareFile(file: File | null, text: string | null, options: PrepareOptions): Promise<void> {
    this.stop();
    this.emit({ state: 'preparing', statusMessage: 'Reading input…', progressPct: 0, error: undefined });

    try {
      let processed: ProcessedFile;
      if (text !== null) {
        processed = processText(text);
      } else if (file) {
        const kind: PayloadKind = detectKind(file);
        const onProgress = (pct: number, status: string) => this.emit({ progressPct: pct * 0.5, statusMessage: status });
        if (kind === 'image') {
          processed = await processImage(file, IMAGE_PRESETS[options.imagePreset], onProgress);
        } else if (kind === 'audio') {
          processed = await processAudio(file, AUDIO_PRESETS[options.audioPreset], onProgress);
        } else {
          processed = await processGenericFile(file);
        }
      } else {
        throw new Error('Nothing to send');
      }

      this.emit({ progressPct: 55, statusMessage: 'Compressing…' });
      const { bytes: compressedBytes, usedCompression } = compressIfBeneficial(processed.bytes);

      let finalBytes = compressedBytes;
      let encryption: 'aes-gcm' | 'none' = 'none';
      if (options.password) {
        this.emit({ progressPct: 70, statusMessage: 'Encrypting…' });
        finalBytes = await encryptWithPassword(compressedBytes, options.password);
        encryption = 'aes-gcm';
      }

      this.emit({ progressPct: 85, statusMessage: 'Building transfer packets…' });
      const built = await buildTransfer({
        processedBytes: finalBytes,
        kind: processed.kind,
        fileName: processed.fileName,
        mimeType: processed.mimeType,
        originalSize: processed.originalSize,
        compression: usedCompression ? 'deflate' : 'none',
        encryption,
        chunkBytes: options.qrSettings.chunkBytes,
      });

      const estimate = estimateTransfer(finalBytes.length, options.qrSettings);
      this.scheduler = new PacketScheduler(built);

      this.emit({
        state: 'ready',
        statusMessage: 'Ready to transmit.',
        progressPct: 100,
        processed,
        built,
        estimate,
        cycleLength: this.scheduler.cycleLength,
      });
    } catch (err) {
      this.emit({
        state: 'failed',
        error: makeError(
          'prepare_failed',
          err instanceof Error ? err.message : 'Could not prepare this file.',
          'Try a smaller file or a different format, then try again.',
        ),
      });
    }
  }

  start(qrSettings: QrSettings, framesPerTick = qrSettings.moduleCount): void {
    if (!this.scheduler) return;
    this.stopInterval();
    this.emit({ state: 'transmitting', statusMessage: 'Transmitting…' });
    const tick = () => {
      if (!this.scheduler) return;
      const frames = this.scheduler.next(framesPerTick);
      this.emit({ currentFrames: frames, packetPosition: this.scheduler.currentPosition() });
    };
    tick();
    this.intervalId = setInterval(tick, 1000 / qrSettings.fps);
  }

  pause(): void {
    this.stopInterval();
    this.emit({ state: 'paused', statusMessage: 'Paused.' });
  }

  resume(qrSettings: QrSettings): void {
    this.start(qrSettings);
  }

  complete(): void {
    this.stopInterval();
    this.emit({ state: 'completed', statusMessage: 'Transmission stopped.' });
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  stop(): void {
    this.stopInterval();
    this.scheduler?.reset();
  }

  reset(): void {
    this.stop();
    this.scheduler = null;
    this.emit({
      state: 'idle',
      statusMessage: 'Choose a file or type a message to begin.',
      progressPct: 0,
      processed: undefined,
      built: undefined,
      estimate: undefined,
      currentFrames: [],
      packetPosition: 0,
      cycleLength: 0,
      error: undefined,
    });
  }

  getSnapshot(): SenderSnapshot {
    return this.snapshot;
  }
}
