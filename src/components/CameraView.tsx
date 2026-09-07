import { forwardRef } from 'react';

export const CameraView = forwardRef<HTMLVideoElement, { active: boolean }>(function CameraView({ active }, ref) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-line bg-black sm:aspect-video">
      <video ref={ref} className="h-full w-full object-cover" autoPlay playsInline muted />
      {active && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-8 rounded-2xl border-2 border-signal/80 sm:inset-16">
            <div className="absolute -top-px -left-px h-6 w-6 border-t-2 border-l-2 border-signal" />
            <div className="absolute -top-px -right-px h-6 w-6 border-t-2 border-r-2 border-signal" />
            <div className="absolute -bottom-px -left-px h-6 w-6 border-b-2 border-l-2 border-signal" />
            <div className="absolute -bottom-px -right-px h-6 w-6 border-b-2 border-r-2 border-signal" />
            <div className="absolute left-0 right-0 h-px bg-signal/80" style={{ animation: 'scan-line 1.8s linear infinite' }} />
          </div>
        </div>
      )}
    </div>
  );
});
