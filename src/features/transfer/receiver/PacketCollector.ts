import type { TransferManifest } from '../../../types/transfer';
import { decodePacket, looksLikeQrMeshPacket, PacketDecodeError, type WirePacket } from '../protocol/Encoding';
import { recoverMissingChunks } from '../protocol/Fec';

export interface CollectorStats {
  sessionId: string | null;
  manifest: TransferManifest | null;
  uniquePackets: number;
  duplicates: number;
  ignoredOtherSession: number;
  corruptedFrames: number;
  totalDataPackets: number;
  missingIndices: number[];
  recoveredByFec: number;
  isComplete: boolean;
}

export class PacketCollector {
  private sessionId: string | null = null;
  private manifest: TransferManifest | null = null;
  private dataChunks = new Map<number, Uint8Array>();
  private parityChunks = new Map<number, Uint8Array>();
  private duplicates = 0;
  private ignoredOtherSession = 0;
  private corruptedFrames = 0;
  private recoveredByFec = 0;
  private groupSize = 8;

  /** Feed a raw scanned QR string. Returns true if it was accepted (new data). */
  ingest(raw: string): boolean {
    if (!looksLikeQrMeshPacket(raw)) return false;

    let packet: WirePacket;
    try {
      packet = decodePacket(raw);
    } catch (err) {
      if (err instanceof PacketDecodeError) this.corruptedFrames++;
      return false;
    }

    // Lock onto the first session we see; ignore any other session's packets
    // so two nearby transfers never get mixed together.
    if (this.sessionId === null) {
      this.sessionId = packet.sessionId;
    } else if (packet.sessionId !== this.sessionId) {
      this.ignoredOtherSession++;
      return false;
    }

    if (packet.type === 'manifest') {
      if (!this.manifest) {
        this.manifest = packet.manifest;
        this.groupSize = 8;
      }
      return true;
    }

    this.groupSize = packet.groupSize;
    const store = packet.type === 'parity' ? this.parityChunks : this.dataChunks;
    if (store.has(packet.index)) {
      this.duplicates++;
      return false;
    }
    store.set(packet.index, packet.data);
    this.tryFecRecovery(packet.total);
    return true;
  }

  private tryFecRecovery(totalDataPackets: number): void {
    if (totalDataPackets <= 0) return;
    const recovered = recoverMissingChunks(totalDataPackets, this.groupSize, this.dataChunks, this.parityChunks);
    for (const { index, chunk } of recovered) {
      if (!this.dataChunks.has(index)) {
        this.dataChunks.set(index, chunk);
        this.recoveredByFec++;
      }
    }
  }

  getStats(): CollectorStats {
    const total = this.manifest?.totalPackets ?? 0;
    const missing: number[] = [];
    for (let i = 0; i < total; i++) {
      if (!this.dataChunks.has(i)) missing.push(i);
    }
    return {
      sessionId: this.sessionId,
      manifest: this.manifest,
      uniquePackets: this.dataChunks.size,
      duplicates: this.duplicates,
      ignoredOtherSession: this.ignoredOtherSession,
      corruptedFrames: this.corruptedFrames,
      totalDataPackets: total,
      missingIndices: missing,
      recoveredByFec: this.recoveredByFec,
      isComplete: total > 0 && this.dataChunks.size === total,
    };
  }

  /** Concatenates data chunks 0..N-1 in order, trimmed to the manifest's exact processed size. */
  assemble(): Uint8Array {
    if (!this.manifest) throw new Error('Cannot assemble before the manifest is received');
    const total = this.manifest.totalPackets;
    const chunkLen = this.dataChunks.get(0)?.length ?? 0;
    const out = new Uint8Array(total * chunkLen);
    for (let i = 0; i < total; i++) {
      const chunk = this.dataChunks.get(i);
      if (!chunk) throw new Error(`Missing packet ${i}, cannot assemble yet`);
      out.set(chunk, i * chunkLen);
    }
    return out.subarray(0, this.manifest.processedSize);
  }

  reset(): void {
    this.sessionId = null;
    this.manifest = null;
    this.dataChunks.clear();
    this.parityChunks.clear();
    this.duplicates = 0;
    this.ignoredOtherSession = 0;
    this.corruptedFrames = 0;
    this.recoveredByFec = 0;
  }
}
