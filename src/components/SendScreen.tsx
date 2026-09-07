import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Lock, Pause, Play, Square, Upload } from 'lucide-react';
import { useSenderEngine } from '../hooks/useSenderEngine';
import { QrStage } from './QrStage';
import { Button, Card, ProgressBar, Stat, Badge } from './ui';
import { QR_PRESETS, recommendPreset } from '../features/transfer/protocol/Estimator';
import { formatBytes, formatDuration } from '../utils/bytes';
import type { QualityPreset } from '../types/transfer';
import { formatSessionLabel } from '../features/transfer/protocol/Session';
import { addHistoryEntry } from '../services/historyStore';

type Step = 1 | 2 | 3 | 4;

export function SendScreen({ onBack }: { onBack: () => void }) {
  const { engine, snapshot } = useSenderEngine();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [inputTab, setInputTab] = useState<'file' | 'text'>('file');
  const [preset, setPreset] = useState<QualityPreset>('balanced');
  const [password, setPassword] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedHistoryRef = useRef(false);

  const hasInput = inputTab === 'file' ? !!file : text.trim().length > 0;

  useEffect(() => {
    if (snapshot.state === 'completed' && snapshot.built && !savedHistoryRef.current) {
      savedHistoryRef.current = true;
      void addHistoryEntry({
        id: snapshot.built.sessionId + '-' + Date.now(),
        sessionId: snapshot.built.sessionId,
        direction: 'sent',
        fileName: snapshot.built.manifest.fileName,
        kind: snapshot.built.manifest.kind,
        mimeType: snapshot.built.manifest.mimeType,
        size: snapshot.built.manifest.originalSize,
        status: 'completed',
        timestamp: Date.now(),
      });
    }
    if (snapshot.state !== 'completed') savedHistoryRef.current = false;
  }, [snapshot.state, snapshot.built]);

  const handleFile = useCallback((f: File | null) => {
    setFile(f);
    if (f) setPreset(recommendPreset(f.size));
  }, []);

  function goToReview() {
    setStep(3);
    void engine.prepareFile(inputTab === 'file' ? file : null, inputTab === 'text' ? text : null, {
      imagePreset: preset === 'reliable' ? 'maximum' : preset === 'balanced' ? 'balanced' : 'fast',
      audioPreset: preset === 'reliable' ? 'compressed' : preset === 'balanced' ? 'compressed' : 'voice',
      qrSettings: QR_PRESETS[preset],
      password: password.trim() || undefined,
    });
  }

  function beginTransmit() {
    setStep(4);
    engine.start(QR_PRESETS[preset]);
  }

  const qrSettings = QR_PRESETS[preset];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-5 pb-16 pt-6">
      <TopBar
        title="Send"
        onBack={() => {
          if (step === 1) onBack();
          else {
            engine.stop();
            setStep((s) => (s - 1) as Step);
          }
        }}
      />
      <Steps step={step} />

      {step === 1 && (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex gap-2">
            <TabButton active={inputTab === 'file'} onClick={() => setInputTab('file')}>Upload file</TabButton>
            <TabButton active={inputTab === 'text'} onClick={() => setInputTab('text')}>Enter text</TabButton>
          </div>

          {inputTab === 'file' ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-signal bg-signal/5' : 'border-line'}`}
            >
              <Upload size={22} className="text-ink-dim" />
              {file ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="font-mono text-sm">{file.name}</span>
                  <span className="text-xs text-ink-dim">{formatBytes(file.size)} · {file.type || 'unknown type'}</span>
                </div>
              ) : (
                <span className="text-sm text-ink-dim">Drag a file here, or</span>
              )}
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                {file ? 'Choose a different file' : 'Browse files'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type or paste the message you want to send…"
              rows={6}
              className="w-full resize-none rounded-xl border border-line bg-void p-3 text-sm outline-none focus-visible:border-signal"
            />
          )}

          <Button size="lg" disabled={!hasInput} onClick={() => setStep(2)}>Continue</Button>
        </Card>
      )}

      {step === 2 && (
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Transfer mode</span>
            <div className="grid grid-cols-3 gap-2">
              {(['reliable', 'balanced', 'fast'] as QualityPreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={`rounded-xl border p-3 text-left transition-colors ${preset === p ? 'border-signal bg-signal/10' : 'border-line'}`}
                >
                  <div className="font-display text-sm font-semibold capitalize">{p}</div>
                  <div className="mt-1 text-[11px] text-ink-dim">
                    {p === 'reliable' && 'Slow · high error correction'}
                    {p === 'balanced' && 'Medium speed · medium density'}
                    {p === 'fast' && 'High density · needs good light'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Lock size={14} /> Encrypt with a password (optional)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for no encryption"
              className="w-full rounded-xl border border-line bg-void p-3 text-sm outline-none focus-visible:border-signal"
            />
            <p className="text-xs text-ink-dim">
              Uses AES-256-GCM. Share this password with the receiver separately — it's never transmitted.
            </p>
          </div>

          <Button size="lg" onClick={goToReview}>Analyze & continue</Button>
        </Card>
      )}

      {step === 3 && (
        <Card className="flex flex-col gap-5 p-5">
          {snapshot.state === 'preparing' && (
            <div className="flex flex-col gap-3">
              <ProgressBar pct={snapshot.progressPct} />
              <span className="text-sm text-ink-dim">{snapshot.statusMessage}</span>
            </div>
          )}
          {snapshot.error && (
            <div className="flex flex-col gap-3">
              <ErrorNote message={snapshot.error.message} suggestion={snapshot.error.suggestion} />
              <Button variant="secondary" onClick={() => setStep(2)}>
                Back to settings
              </Button>
            </div>
          )}
          {snapshot.state === 'ready' && snapshot.estimate && snapshot.processed && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="File size" value={formatBytes(snapshot.processed.originalSize)} />
                <Stat label="Sent as" value={formatBytes(snapshot.estimate.processedBytes)} />
                <Stat label="Packets" value={`${snapshot.estimate.totalDataPackets} + ${snapshot.estimate.parityPackets} parity`} />
                <Stat label="Est. time" value={formatDuration(snapshot.estimate.estimatedSeconds)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{qrSettings.moduleCount === 4 ? '2×2 grid' : 'single QR'}</Badge>
                <Badge>{qrSettings.fps} FPS</Badge>
                <Badge>ECC {qrSettings.errorCorrectionLevel}</Badge>
                {password.trim() && <Badge tone="crypt"><Lock size={11} /> encrypted</Badge>}
              </div>
              <Button size="lg" onClick={beginTransmit}>Start transmission</Button>
            </>
          )}
        </Card>
      )}

      {step === 4 && snapshot.built && (
        <div className="flex flex-col gap-5">
          <QrStage frames={snapshot.currentFrames} settings={qrSettings} />
          <Card className="flex flex-col gap-4 p-5">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Packet" value={`${snapshot.packetPosition} / ${snapshot.cycleLength}`} />
              <Stat label="Speed" value={`${qrSettings.fps} FPS`} />
              <Stat label="Session" value={formatSessionLabel(snapshot.built.sessionId)} mono />
            </div>
            <ProgressBar pct={(snapshot.packetPosition / Math.max(1, snapshot.cycleLength)) * 100} />
            <div className="flex gap-2">
              {snapshot.state === 'transmitting' ? (
                <Button variant="secondary" className="flex-1" onClick={() => engine.pause()}>
                  <Pause size={15} /> Pause
                </Button>
              ) : (
                <Button className="flex-1" onClick={() => engine.resume(qrSettings)}>
                  <Play size={15} /> Resume
                </Button>
              )}
              <Button variant="danger" className="flex-1" onClick={() => engine.complete()}>
                <Square size={15} /> Stop
              </Button>
            </div>
            <p className="text-xs text-ink-dim">
              The stream loops continuously — leave it running until the receiving device shows
              "Transfer complete." There's no need to catch every single frame.
            </p>
          </Card>
          {snapshot.state === 'completed' && (
            <Button size="lg" variant="secondary" onClick={() => { engine.reset(); setStep(1); setFile(null); setText(''); setPassword(''); }}>
              Send something else
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-dim hover:text-ink" aria-label="Back">
        <ArrowLeft size={16} />
      </button>
      <h1 className="font-display text-xl font-semibold">{title}</h1>
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const labels = ['Select', 'Optimize', 'Review', 'Transmit'];
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 4`}>
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        return (
          <div key={label} className="flex flex-1 flex-col gap-1.5">
            <div className={`h-1 rounded-full ${n <= step ? 'bg-signal' : 'bg-line'}`} />
            <span className={`text-[10px] ${n === step ? 'text-ink' : 'text-ink-dim'}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${active ? 'border-signal bg-signal/10 text-ink' : 'border-line text-ink-dim'}`}
    >
      {children}
    </button>
  );
}

function ErrorNote({ message, suggestion }: { message: string; suggestion: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-mesh-bad/40 bg-mesh-bad/10 p-3">
      <span className="text-sm font-medium text-mesh-bad">{message}</span>
      <span className="text-xs text-ink-dim">{suggestion}</span>
    </div>
  );
}
