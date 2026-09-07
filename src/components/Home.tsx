import { ArrowRight, FileText, History, Image as ImageIcon, Music, Radio, Send } from 'lucide-react';
import { Card } from './ui';
import type { AppMode } from '../types/transfer';

export function Home({ onNavigate, onOpenHistory }: { onNavigate: (mode: AppMode) => void; onOpenHistory: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-5 pb-16 pt-10 sm:max-w-2xl">
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal/15 text-signal">
            <Radio size={18} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">QRMesh Advanced</span>
        </div>
        <button
          onClick={onOpenHistory}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-dim hover:text-ink"
          aria-label="Transfer history"
        >
          <History size={18} />
        </button>
      </header>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
          Move data with light,
          <br />
          not a network.
        </h1>
        <p className="max-w-md text-ink-dim">
          One device streams data as animated QR codes. The other reads it with a camera.
          No internet, Wi-Fi, Bluetooth, or server ever touches your data.
        </p>
      </div>

      <MeshDiagram />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={() => onNavigate('send')}
          className="group flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-signal/60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-signal/15 text-signal">
            <Send size={18} />
          </span>
          <span className="font-display text-xl font-semibold">Send</span>
          <span className="text-sm text-ink-dim">Pick a file or type a message, then transmit it as a QR stream.</span>
          <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-signal">
            Start sending <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>

        <button
          onClick={() => onNavigate('receive')}
          className="group flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-signal/60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-packet/15 text-packet">
            <ImageIcon size={18} />
          </span>
          <span className="font-display text-xl font-semibold">Receive</span>
          <span className="text-sm text-ink-dim">Point your camera at another device's screen to collect its packets.</span>
          <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-packet">
            Start scanning <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <span className="text-[11px] uppercase tracking-wide text-ink-dim">What actually transfers well</span>
        <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <li className="flex items-center gap-2"><FileText size={15} className="text-ink-dim" /> Text — instant</li>
          <li className="flex items-center gap-2"><ImageIcon size={15} className="text-ink-dim" /> Images — seconds–min</li>
          <li className="flex items-center gap-2"><Music size={15} className="text-ink-dim" /> Short audio — minutes</li>
          <li className="flex items-center gap-2"><FileText size={15} className="text-ink-dim" /> Small files (&lt;100 KB)</li>
        </ul>
        <p className="text-xs text-ink-dim">
          QR codes carry a few hundred bytes each. A 20 KB photo is realistic in under a minute;
          multi-megabyte files will take a long time or aren't a good fit for this method.
        </p>
      </Card>
    </div>
  );
}

function MeshDiagram() {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-5 sm:px-8">
      <DiagramNode label="Phone A" sub="sender" />
      <DiagramLink label="QR stream" />
      <span className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-void text-ink-dim">▦</span>
      <DiagramLink label="camera" />
      <DiagramNode label="Phone B" sub="receiver" />
    </div>
  );
}

function DiagramNode({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="grid h-11 w-8 place-items-center rounded-md border border-line bg-void">
        <span className="h-1 w-1 rounded-full bg-ink-dim" />
      </div>
      <span className="font-mono text-[11px] text-ink">{label}</span>
      <span className="text-[10px] text-ink-dim">{sub}</span>
    </div>
  );
}

function DiagramLink({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-1">
      <svg width="100%" height="8" viewBox="0 0 100 8" preserveAspectRatio="none" className="w-full">
        <line x1="0" y1="4" x2="100" y2="4" stroke="var(--color-signal)" strokeWidth="2" strokeDasharray="4 4" style={{ animation: 'dash-flow 1.2s linear infinite' }} />
      </svg>
      <span className="text-[10px] text-ink-dim">{label}</span>
    </div>
  );
}
