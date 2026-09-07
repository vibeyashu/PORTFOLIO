import { useEffect, useState } from 'react';
import { ReceiverEngine, type ReceiverSnapshot } from '../features/transfer/receiver/ReceiverEngine';

export function useReceiverEngine() {
  const [engine] = useState(() => new ReceiverEngine());
  const [snapshot, setSnapshot] = useState<ReceiverSnapshot>(() => engine.getSnapshot());

  useEffect(() => {
    const unsub = engine.subscribe(setSnapshot);
    return () => {
      unsub();
      engine.stop();
    };
  }, [engine]);

  return { engine, snapshot };
}
