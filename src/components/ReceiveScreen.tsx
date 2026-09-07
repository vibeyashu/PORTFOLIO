import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Download, RefreshCcw, RotateCcw, Share2, X } from 'lucide-react';
import { useReceiverEngine } from '../hooks/useReceiverEngine';
import { CameraView } from './CameraView';
import { Button, Card, ProgressBar, Stat, Badge } from './ui';
import { formatBytes } from '../utils/bytes';
import { addHistoryEntry } from '../services/historyStore';

export function ReceiveScreen({ onBack }: { onBack: () => void }) {
  const { engine, snapshot } = useReceiverEngine();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [password, setPassword] = useState('');
  const savedHistoryRef = useRef(false);

  useEffect(() => {
    if (videoRef.current) void engine.startScanning(videoRef.current);
    return () => engine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (snapshot.state === 'completed' && snapshot.result && !savedHistoryRef.current) {
      savedHistoryRef.current = true;
      void addHistoryEntry({
        id: snapshot.result.manifest.sessionId + '-' + Date.now(),
        sessionId: snapshot.result.manifest.sessionId,
        direction: 'received',
        fileName: snapshot.result.manifest.fileName,
        kind: snapshot.result.manifest.kind,
        mimeType: snapshot.result.manifest.mimeType,
        size: snapshot.result.manifest.originalSize,
        status: snapshot.result.integrityVerified ? 'completed' : 'failed',
        timestamp: Date.now(),
      });
    }
  }, [snapshot.state, snapshot.result]);

  const stats = snapshot.stats;
  const showCamera = snapshot.state === 'scanning' || snapshot.state === 'receiving';
  const showCameraBlock =
    !snapshot.needsPassword && snapshot.state !== 'completed' && snapshot.state !== 'failed';

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-5 pb-16 pt-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-dim hover:text-ink" aria-label="Back">
          <ArrowLeft size={16} />
        </button>
        <h1 className="font-display text-xl font-semibold">Receive</h1>
      </div>

      {/* The <video> element is always mounted (just hidden when not needed) so its ref
          is available the moment we want to start the camera — starting the camera is
          what drives the state to 'scanning' in the first place. */}
      <div className={showCameraBlock ? 'contents' : 'hidden'}>
        <CameraView ref={videoRef} active={showCamera} />
        <Card className="flex flex-col gap-4 p-5">
          <span className="text-sm text-ink-dim">{snapshot.statusMessage}</span>
          {stats.manifest && (
              <>
                <ProgressBar pct={(stats.uniquePackets / Math.max(1, stats.totalDataPackets)) * 100} />
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Packets collected" value={`${stats.uniquePackets} / ${stats.totalDataPackets}`} />
                  <Stat label="Duplicates ignored" value={stats.duplicates} />
                  <Stat label="Missing" value={stats.missingIndices.length} />
                  <Stat label="Recovered (FEC)" value={stats.recoveredByFec} />
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => videoRef.current && void engine.switchCamera()}>
                <RefreshCcw size={15} /> Switch camera
              </Button>
            </div>
            <p className="text-xs text-ink-dim">
              Hold the camera 15–30 cm from the screen and keep the QR code fully inside the frame.
              Good, even lighting helps a lot.
            </p>
          </Card>
      </div>

      {snapshot.needsPassword && (
        <Card className="flex flex-col gap-3 p-5">
          <span className="text-sm font-medium">This transfer is encrypted</span>
          {snapshot.error && (
            <div className="flex flex-col gap-1 rounded-xl border border-mesh-bad/40 bg-mesh-bad/10 p-3">
              <span className="text-sm font-medium text-mesh-bad">{snapshot.error.message}</span>
              <span className="text-xs text-ink-dim">{snapshot.error.suggestion}</span>
            </div>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password.trim()) {
                void engine.submitPassword(password);
              }
            }}
            placeholder="Enter the password"
            className="w-full rounded-xl border border-line bg-void p-3 text-sm outline-none focus-visible:border-signal"
          />
          <Button onClick={() => void engine.submitPassword(password)} disabled={!password}>Decrypt</Button>
        </Card>
      )}

      {snapshot.error && !snapshot.needsPassword && (
        <Card className="flex flex-col gap-3 p-5">
          <span className="text-sm font-medium text-mesh-bad">{snapshot.error.message}</span>
          <span className="text-xs text-ink-dim">{snapshot.error.suggestion}</span>
          <Button onClick={() => videoRef.current && void engine.startScanning(videoRef.current)}>
            <RotateCcw size={15} /> Try again
          </Button>
        </Card>
      )}

      {snapshot.state === 'completed' && snapshot.result && (
        <ResultView
          result={snapshot.result}
          onRestart={() => {
            savedHistoryRef.current = false;
            engine.reset();
            if (videoRef.current) void engine.startScanning(videoRef.current);
          }}
        />
      )}
    </div>
  );
}

function ResultView({ result, onRestart }: { result: NonNullable<ReturnType<typeof useReceiverEngine>['snapshot']['result']>; onRestart: () => void }) {
  const { manifest, integrityVerified, bytes, text } = result;
  const blobUrl = useMemoObjectUrl(bytes, manifest.mimeType);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-semibold">Transfer complete</span>
        {integrityVerified ? (
          <Badge tone="ok"><Check size={12} /> Integrity verified</Badge>
        ) : (
          <Badge tone="bad"><X size={12} /> Integrity failed</Badge>
        )}
      </div>

      {!integrityVerified && (
        <p className="text-xs text-mesh-bad">
          The reconstructed data doesn't match the sender's checksum. Don't trust this file —
          rescan the transfer from the start.
        </p>
      )}

      {manifest.kind === 'text' && text !== undefined && (
        <div className="flex flex-col gap-3">
          <div className="whitespace-pre-wrap rounded-xl border border-line bg-void p-4 text-sm">{text}</div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => navigator.clipboard.writeText(text)}>
              <Copy size={14} /> Copy
            </Button>
            {'share' in navigator && (
              <Button variant="secondary" className="flex-1" onClick={() => navigator.share?.({ text })}>
                <Share2 size={14} /> Share
              </Button>
            )}
          </div>
        </div>
      )}

      {manifest.kind === 'image' && blobUrl && (
        <img src={blobUrl} alt={manifest.fileName} className="w-full rounded-xl border border-line" />
      )}

      {manifest.kind === 'audio' && blobUrl && (
        <audio src={blobUrl} controls className="w-full" />
      )}

      {(manifest.kind === 'file' || manifest.kind === 'pdf') && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-void p-3">
          <span className="font-mono text-sm">{manifest.fileName}</span>
          <span className="text-xs text-ink-dim">{formatBytes(manifest.originalSize)}</span>
        </div>
      )}

      {manifest.kind !== 'text' && blobUrl && (
        <a href={blobUrl} download={manifest.fileName} className="block w-full">
          <Button className="w-full"><Download size={15} /> Save {manifest.fileName}</Button>
        </a>
      )}

      <Button variant="secondary" onClick={onRestart}>
        <RotateCcw size={15} /> Receive another
      </Button>
    </Card>
  );
}

function useMemoObjectUrl(bytes: Uint8Array, mimeType: string): string | null {
  const ref = useRef<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    ref.current = objectUrl;
    setUrl(objectUrl);
    return () => {
      if (ref.current) URL.revokeObjectURL(ref.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, mimeType]);
  return url;
}
