import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Trash2, X } from 'lucide-react';
import { clearHistory, listHistory } from '../services/historyStore';
import type { TransferHistoryEntry } from '../types/transfer';
import { Button } from './ui';
import { formatBytes } from '../utils/bytes';

export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<TransferHistoryEntry[]>([]);

  useEffect(() => {
    void listHistory().then(setEntries);
  }, []);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col gap-4 rounded-t-2xl border border-line bg-surface p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Transfer history</h2>
          <button onClick={onClose} className="text-ink-dim hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-dim">No transfers yet. Files you send or receive show up here.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line bg-void p-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${e.direction === 'sent' ? 'bg-signal/15 text-signal' : 'bg-packet/15 text-packet'}`}>
                    {e.direction === 'sent' ? <ArrowUpFromLine size={14} /> : <ArrowDownToLine size={14} />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono text-sm">{e.fileName}</span>
                    <span className="text-[11px] text-ink-dim">
                      {new Date(e.timestamp).toLocaleString()} · {formatBytes(e.size)}
                    </span>
                  </div>
                  <span className={`text-[11px] ${e.status === 'completed' ? 'text-mesh-ok' : 'text-mesh-bad'}`}>{e.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {entries.length > 0 && (
          <Button
            variant="danger"
            onClick={async () => {
              await clearHistory();
              setEntries([]);
            }}
          >
            <Trash2 size={15} /> Clear history
          </Button>
        )}
      </div>
    </div>
  );
}
