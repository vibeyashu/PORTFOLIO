import { useState } from 'react';
import { Home } from './components/Home';
import { SendScreen } from './components/SendScreen';
import { ReceiveScreen } from './components/ReceiveScreen';
import { HistoryPanel } from './components/HistoryPanel';
import type { AppMode } from './types/transfer';

export default function App() {
  const [mode, setMode] = useState<AppMode>('home');
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="relative z-[1] min-h-svh">
      {mode === 'home' && <Home onNavigate={setMode} onOpenHistory={() => setHistoryOpen(true)} />}
      {mode === 'send' && <SendScreen onBack={() => setMode('home')} />}
      {mode === 'receive' && <ReceiveScreen onBack={() => setMode('home')} />}
      {historyOpen && <HistoryPanel onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
