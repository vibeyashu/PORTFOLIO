import { useEffect, useRef } from 'react';
import { renderQrToCanvas } from '../features/transfer/qr/QRGenerator';
import type { QrSettings } from '../types/transfer';

export function QrStage({ frames, settings }: { frames: string[]; settings: QrSettings }) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const isGrid = settings.moduleCount === 4 && frames.length > 1;

  useEffect(() => {
    const targetSize = isGrid ? Math.min(180, Math.floor(settings.qrPixelSize / 2)) : settings.qrPixelSize;
    frames.forEach((frame, i) => {
      const canvas = canvasRefs.current[i];
      if (canvas) {
        void renderQrToCanvas(canvas, frame, targetSize, settings.errorCorrectionLevel)
          .then(() => {
            canvas.style.maxWidth = '100%';
            canvas.style.height = 'auto';
          })
          .catch((err) => {
            console.warn('Failed to render QR frame', err);
          });
      }
    });
  }, [frames, settings.qrPixelSize, settings.errorCorrectionLevel, isGrid]);

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-3xl border border-line bg-white p-5 shadow-[0_0_60px_-15px_rgba(58,160,255,0.4)]"
      role="img"
      aria-label="Animated QR data stream, hold your receiving device's camera up to it"
    >
      <div className={isGrid ? 'grid grid-cols-2 gap-3 max-w-full' : 'flex w-full items-center justify-center'}>
        {frames.map((_, i) => (
          <canvas
            key={i}
            ref={(el) => {
              canvasRefs.current[i] = el;
            }}
            className="block aspect-square max-w-full rounded-xl object-contain shadow-sm"
            style={{
              width: isGrid ? '160px' : `${settings.qrPixelSize}px`,
              maxWidth: '100%',
              height: 'auto',
            }}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-4 overflow-hidden rounded-2xl">
        <div className="absolute left-0 right-0 h-px bg-signal/70" style={{ animation: 'scan-line 2.2s linear infinite' }} />
      </div>
    </div>
  );
}
