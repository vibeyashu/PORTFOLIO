import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'lg' | 'sm' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]',
        size === 'lg' && 'px-6 py-4 text-base min-h-14',
        size === 'md' && 'px-4 py-2.5 text-sm min-h-11',
        size === 'sm' && 'px-3 py-1.5 text-xs min-h-9',
        variant === 'primary' && 'bg-signal text-void hover:bg-[#5cb1ff]',
        variant === 'secondary' && 'bg-surface-raised text-ink border border-line hover:border-signal/60',
        variant === 'ghost' && 'text-ink-dim hover:text-ink hover:bg-surface-raised',
        variant === 'danger' && 'bg-mesh-bad/15 text-mesh-bad border border-mesh-bad/40 hover:bg-mesh-bad/25',
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface/80 backdrop-blur-sm', className)}>
      {children}
    </div>
  );
}

export function ProgressBar({ pct, tone = 'signal' }: { pct: number; tone?: 'signal' | 'ok' | 'bad' }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = tone === 'ok' ? 'bg-mesh-ok' : tone === 'bad' ? 'bg-mesh-bad' : 'bg-signal';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-void border border-line" role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-200', color)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Stat({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-dim">{label}</span>
      <span className={cn('text-lg text-ink', mono && 'font-mono tabular-nums')}>{value}</span>
    </div>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'ok' | 'bad' | 'crypt' }) {
  const toneClass =
    tone === 'ok'
      ? 'text-mesh-ok border-mesh-ok/40 bg-mesh-ok/10'
      : tone === 'bad'
        ? 'text-mesh-bad border-mesh-bad/40 bg-mesh-bad/10'
        : tone === 'crypt'
          ? 'text-crypt border-crypt/40 bg-crypt/10'
          : 'text-ink-dim border-line bg-surface-raised';
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono', toneClass)}>
      {children}
    </span>
  );
}
