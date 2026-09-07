import { openDB, type IDBPDatabase } from 'idb';
import type { TransferHistoryEntry } from '../types/transfer';

const DB_NAME = 'qrmesh-advanced';
const STORE = 'history';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;
const memoryFallback: TransferHistoryEntry[] = [];

async function getDbSafe(): Promise<IDBPDatabase | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    if (!dbPromise) {
      dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp');
          }
        },
      });
    }
    return await dbPromise;
  } catch (err) {
    console.warn('IndexedDB unavailable, falling back to memory store', err);
    return null;
  }
}

export async function addHistoryEntry(entry: TransferHistoryEntry): Promise<void> {
  try {
    const db = await getDbSafe();
    if (db) {
      await db.put(STORE, entry);
      return;
    }
  } catch {
    // fallback to memory
  }
  memoryFallback.unshift(entry);
}

export async function listHistory(): Promise<TransferHistoryEntry[]> {
  try {
    const db = await getDbSafe();
    if (db) {
      const all = await db.getAll(STORE);
      return all.sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch {
    // fallback to memory
  }
  return [...memoryFallback].sort((a, b) => b.timestamp - a.timestamp);
}

export async function clearHistory(): Promise<void> {
  try {
    const db = await getDbSafe();
    if (db) {
      await db.clear(STORE);
    }
  } catch {
    // fallback to memory
  }
  memoryFallback.length = 0;
}
