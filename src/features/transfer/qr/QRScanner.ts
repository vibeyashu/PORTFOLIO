import jsQR from 'jsqr';

export type CameraFacing = 'environment' | 'user';

export interface ScannerOptions {
  /** Downscale camera frames to this width before decoding — full-res 4K frames are wasted work for jsQR. */
  decodeWidth: number;
  /** Minimum ms between decode attempts, to avoid pegging the CPU / freezing the UI. */
  minDecodeIntervalMs: number;
  onDecode: (text: string) => void;
  onFrame?: (found: boolean) => void;
  onError: (error: ScannerError) => void;
}

export type ScannerErrorCode =
  | 'permission_denied'
  | 'no_camera'
  | 'camera_unavailable'
  | 'unsupported_browser';

export class ScannerError extends Error {
  code: ScannerErrorCode;
  constructor(code: ScannerErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export class QRScanner {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rafId: number | null = null;
  private lastDecodeAt = 0;
  private running = false;
  private facing: CameraFacing = 'environment';
  private readonly options: ScannerOptions;

  constructor(options: ScannerOptions) {
    this.options = options;
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', 'true');
    this.video.muted = true;
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  attachPreview(el: HTMLVideoElement): void {
    el.srcObject = this.video.srcObject;
    el.setAttribute('playsinline', 'true');
    el.muted = true;
    void el.play().catch(() => {});
    this.video = el;
  }

  async start(facing: CameraFacing = 'environment'): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new ScannerError('unsupported_browser', 'This browser does not support camera access.');
    }
    this.facing = facing;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err) {
      const name = (err as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new ScannerError('permission_denied', 'Camera permission was denied.');
      }
      if (name === 'NotFoundError') {
        throw new ScannerError('no_camera', 'No camera was found on this device.');
      }
      throw new ScannerError('camera_unavailable', 'The camera could not be started.');
    }
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    this.running = true;
    this.loop();
  }

  async switchCamera(): Promise<void> {
    const next: CameraFacing = this.facing === 'environment' ? 'user' : 'environment';
    this.stop();
    await this.start(next);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const now = performance.now();
    if (now - this.lastDecodeAt < this.options.minDecodeIntervalMs) return;
    if (this.video.readyState !== this.video.HAVE_ENOUGH_DATA) return;
    this.lastDecodeAt = now;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return;

    const scale = this.options.decodeWidth / vw;
    const w = this.options.decodeWidth;
    const h = Math.round(vh * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(this.video, 0, 0, w, h);
    const imageData = this.ctx.getImageData(0, 0, w, h);
    const result = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
    this.options.onFrame?.(!!result);
    if (result?.data) {
      this.options.onDecode(result.data);
    }
  };
}
