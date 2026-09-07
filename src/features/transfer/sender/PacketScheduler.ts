import type { BuiltTransfer } from '../protocol/PacketBuilder';

/**
 * Decides which frame(s) to show next. Because this is a one-way optical
 * link (screen -> camera, no return channel), the sender has no way to know
 * which packets the receiver is actually missing. The practical
 * realization of "prioritize likely-missing packets" here is: re-broadcast
 * the manifest more often than any single data packet (it's small and
 * essential for a late-joining scanner), and otherwise cycle every data and
 * parity packet with equal, fair frequency so no packet is starved.
 */
export class PacketScheduler {
  private readonly frames: string[];
  private readonly transfer: BuiltTransfer;
  private readonly manifestEveryN: number;
  private dataCursor = 0;
  private totalTicks = 0;

  constructor(transfer: BuiltTransfer, manifestEveryN = 25) {
    this.transfer = transfer;
    this.manifestEveryN = manifestEveryN;
    this.frames = [...transfer.dataFrames, ...transfer.parityFrames];
  }

  get totalDataPackets(): number {
    return this.transfer.manifest.totalPackets;
  }

  get totalParityPackets(): number {
    return this.transfer.manifest.parityPackets;
  }

  get cycleLength(): number {
    return this.frames.length;
  }

  reset(): void {
    this.dataCursor = 0;
    this.totalTicks = 0;
  }

  /** Returns the next `count` frames to display (for single or grid QR modes). */
  next(count: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      if (this.totalTicks % this.manifestEveryN === 0) {
        out.push(this.transfer.manifestFrame);
      } else {
        out.push(this.frames[this.dataCursor % this.frames.length]);
        this.dataCursor++;
      }
      this.totalTicks++;
    }
    if (out.length === 0) return [this.transfer.manifestFrame];
    return out;
  }

  /** 0-based logical position, useful for a "packet X / N" style readout. */
  currentPosition(): number {
    if (this.frames.length === 0) return 0;
    return this.dataCursor % this.frames.length;
  }
}
