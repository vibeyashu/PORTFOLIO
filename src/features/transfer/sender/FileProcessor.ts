import type { AudioProcessingOptions, ImageProcessingOptions, PayloadKind } from '../../../types/transfer';

export interface ProcessedFile {
  kind: PayloadKind;
  mimeType: string;
  fileName: string;
  bytes: Uint8Array;
  originalSize: number;
}

export function detectKind(file: File): PayloadKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type === 'application/pdf') return 'pdf';
  return 'file';
}

export const IMAGE_PRESETS: Record<ImageProcessingOptions['preset'], ImageProcessingOptions> = {
  maximum: { preset: 'maximum', maxDimension: 1024, jpegQuality: 0.85 },
  balanced: { preset: 'balanced', maxDimension: 480, jpegQuality: 0.6 },
  fast: { preset: 'fast', maxDimension: 240, jpegQuality: 0.35 },
};

export const AUDIO_PRESETS: Record<AudioProcessingOptions['preset'], AudioProcessingOptions> = {
  original: { preset: 'original', sampleRate: 44100, mono: false },
  compressed: { preset: 'compressed', sampleRate: 16000, mono: true },
  voice: { preset: 'voice', sampleRate: 8000, mono: true },
};

async function readImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function processImage(
  file: File,
  options: ImageProcessingOptions,
  onProgress?: (pct: number, status: string) => void,
): Promise<ProcessedFile> {
  onProgress?.(10, 'Loading image…');
  const img = await readImageElement(file);

  onProgress?.(35, 'Resizing…');
  let { width, height } = img;
  const { maxDimension, jpegQuality } = options;
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, width, height);

  onProgress?.(70, 'Encoding JPEG…');
  const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
  const base64 = dataUrl.split(',')[1];
  const bytes = base64ToBytes(base64);

  onProgress?.(100, 'Image ready');
  return {
    kind: 'image',
    mimeType: 'image/jpeg',
    fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    bytes,
    originalSize: file.size,
  };
}

function encodeWav(samples: Float32Array, sampleRate: number, mono: boolean): ArrayBuffer {
  // 16-bit PCM mono WAV — a good balance of simplicity and fidelity for speech/short clips.
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  const channels = mono ? 1 : 1; // we always render mono for size; stereo not worth the bytes here
  const byteRate = sampleRate * channels * 2;
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export async function processAudio(
  file: File,
  options: AudioProcessingOptions,
  onProgress?: (pct: number, status: string) => void,
): Promise<ProcessedFile> {
  onProgress?.(10, 'Loading audio…');
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error('Audio decoding is not supported in this browser');
  const ctx = new AudioCtx();
  try {
    const arrayBuffer = await file.arrayBuffer();

    onProgress?.(30, 'Decoding audio…');
    const decoded = await ctx.decodeAudioData(arrayBuffer);

    onProgress?.(55, `Resampling to ${options.sampleRate} Hz…`);
    const frameCount = Math.max(1, Math.ceil(decoded.duration * options.sampleRate));
    const offline = new OfflineAudioContext(1, frameCount, options.sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();

    onProgress?.(80, 'Encoding WAV…');
    const wav = encodeWav(rendered.getChannelData(0), options.sampleRate, options.mono);

    onProgress?.(100, 'Audio ready');
    return {
      kind: 'audio',
      mimeType: 'audio/wav',
      fileName: file.name.replace(/\.[^.]+$/, '') + '.wav',
      bytes: new Uint8Array(wav),
      originalSize: file.size,
    };
  } finally {
    void ctx.close().catch(() => {});
  }
}

export async function processGenericFile(file: File): Promise<ProcessedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    kind: file.type === 'application/pdf' ? 'pdf' : 'file',
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
    bytes,
    originalSize: file.size,
  };
}

export function processText(text: string): ProcessedFile {
  const bytes = new TextEncoder().encode(text);
  return {
    kind: 'text',
    mimeType: 'text/plain',
    fileName: 'message.txt',
    bytes,
    originalSize: bytes.length,
  };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
