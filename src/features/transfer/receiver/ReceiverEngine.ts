import type { AppError, ReceptionState } from '../../../types/transfer';
import { PacketCollector, type CollectorStats } from './PacketCollector';
import { reconstructFile, ReconstructionNeedsPasswordError, type ReconstructionResult } from './FileReconstructor';
import { QRScanner, ScannerError, type CameraFacing } from '../qr/QRScanner';
import { DecryptionError } from '../encryption/Encryption';

export interface ReceiverSnapshot {
  state: ReceptionState;
  statusMessage: string;
  stats: CollectorStats;
  result?: ReconstructionResult;
  needsPassword: boolean;
  error?: AppError;
}

export type ReceiverListener = (snapshot: ReceiverSnapshot) => void;

function makeError(code: string, message: string, suggestion: string, retryable = true): AppError {
  return { code, message, suggestion, retryable };
}

const emptyStats: CollectorStats = {
  sessionId: null,
  manifest: null,
  uniquePackets: 0,
  duplicates: 0,
  ignoredOtherSession: 0,
  corruptedFrames: 0,
  totalDataPackets: 0,
  missingIndices: [],
  recoveredByFec: 0,
  isComplete: false,
};

export class ReceiverEngine {
  private collector = new PacketCollector();
  private scanner: QRScanner | null = null;
  private listeners = new Set<ReceiverListener>();
  private snapshot: ReceiverSnapshot = {
    state: 'idle',
    statusMessage: 'Ready to scan.',
    stats: emptyStats,
    needsPassword: false,
  };
  private reconstructing = false;

  subscribe(listener: ReceiverListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  private emit(partial: Partial<ReceiverSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const l of this.listeners) l(this.snapshot);
  }

  async startScanning(videoEl: HTMLVideoElement, facing: CameraFacing = 'environment'): Promise<void> {
    this.collector.reset();
    this.emit({ state: 'scanning', statusMessage: 'Point the camera at the QR stream.', stats: emptyStats, error: undefined, result: undefined });

    this.scanner = new QRScanner({
      decodeWidth: 480,
      minDecodeIntervalMs: 80,
      onDecode: (text) => this.handleDecode(text),
      onError: (err) => this.handleScannerError(err),
    });

    try {
      await this.scanner.start(facing);
      this.scanner.attachPreview(videoEl);
    } catch (err) {
      if (err instanceof ScannerError) {
        this.handleScannerError(err);
      } else {
        this.emit({ state: 'failed', error: makeError('camera_error', 'Could not access the camera.', 'Check camera permissions and try again.') });
      }
    }
  }

  async switchCamera(): Promise<void> {
    try {
      await this.scanner?.switchCamera();
    } catch (err) {
      if (err instanceof ScannerError) {
        this.handleScannerError(err);
      } else {
        this.emit({ state: 'failed', error: makeError('camera_error', 'Failed to switch camera.', 'Try restarting the scan.') });
      }
    }
  }

  private handleScannerError(err: ScannerError): void {
    const messages: Record<ScannerError['code'], { message: string; suggestion: string }> = {
      permission_denied: {
        message: 'Camera permission was denied.',
        suggestion: 'Allow camera access in your browser settings, then try again.',
      },
      no_camera: {
        message: 'No camera was found on this device.',
        suggestion: 'Connect a camera or try on a device that has one.',
      },
      camera_unavailable: {
        message: 'The camera could not be started.',
        suggestion: 'Close other apps that might be using the camera and try again.',
      },
      unsupported_browser: {
        message: 'This browser does not support camera access.',
        suggestion: 'Try the latest Chrome, Safari, or Firefox.',
      },
    };
    const info = messages[err.code];
    this.emit({ state: 'failed', error: makeError(err.code, info.message, info.suggestion) });
  }

  private handleDecode(raw: string): void {
    if (this.reconstructing) return;
    const accepted = this.collector.ingest(raw);
    const stats = this.collector.getStats();

    if (accepted && this.snapshot.state === 'scanning') {
      this.emit({ state: 'receiving' });
    }
    this.emit({ stats, statusMessage: this.buildStatusMessage(stats) });

    if (stats.isComplete && !this.reconstructing) {
      void this.finish();
    }
  }

  private buildStatusMessage(stats: CollectorStats): string {
    if (!stats.manifest) return 'Waiting for transfer metadata…';
    if (stats.isComplete) return 'All packets collected.';
    return `Collecting packets… ${stats.uniquePackets}/${stats.totalDataPackets}`;
  }

  private async finish(password?: string): Promise<void> {
    this.reconstructing = true;
    this.scanner?.stop();
    const stats = this.collector.getStats();
    if (!stats.manifest) return;

    this.emit({ state: 'reconstructing', statusMessage: 'Reassembling file…' });
    try {
      const assembled = this.collector.assemble();
      this.emit({ state: 'verifying', statusMessage: 'Verifying integrity…' });
      const result = await reconstructFile(stats.manifest, assembled, password);
      this.emit({
        state: 'completed',
        statusMessage: result.integrityVerified ? 'Integrity verified.' : 'Integrity check failed.',
        result,
        needsPassword: false,
        error: undefined,
      });
    } catch (err) {
      if (err instanceof ReconstructionNeedsPasswordError) {
        this.emit({ state: 'idle', statusMessage: 'Enter the password to decrypt this transfer.', needsPassword: true });
        this.reconstructing = false;
        return;
      }
      if (err instanceof DecryptionError) {
        this.emit({ state: 'failed', error: makeError('decrypt_failed', err.message, 'Double-check the password and try again.'), needsPassword: true });
        this.reconstructing = false;
        return;
      }
      this.emit({
        state: 'failed',
        error: makeError('reconstruct_failed', err instanceof Error ? err.message : 'Could not reconstruct the file.', 'Try scanning again from the start.'),
      });
    }
    this.reconstructing = false;
  }

  async submitPassword(password: string): Promise<void> {
    await this.finish(password);
  }

  stop(): void {
    this.scanner?.stop();
    this.scanner = null;
  }

  reset(): void {
    this.stop();
    this.collector.reset();
    this.reconstructing = false;
    this.emit({ state: 'idle', statusMessage: 'Ready to scan.', stats: emptyStats, result: undefined, error: undefined, needsPassword: false });
  }

  getSnapshot(): ReceiverSnapshot {
    return this.snapshot;
  }
}
