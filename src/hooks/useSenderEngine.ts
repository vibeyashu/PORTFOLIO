import { useEffect, useState } from 'react';
import { SenderEngine, type SenderSnapshot } from '../features/transfer/sender/SenderEngine';

export function useSenderEngine() {
  const [engine] = useState(() => new SenderEngine());
  const [snapshot, setSnapshot] = useState<SenderSnapshot>(() => engine.getSnapshot());

  useEffect(() => {
    const unsub = engine.subscribe(setSnapshot);
    return () => {
      unsub();
      engine.stop();
    };
  }, [engine]);

  return { engine, snapshot };
}
