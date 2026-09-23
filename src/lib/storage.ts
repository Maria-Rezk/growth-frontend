/**
 * Safe, versioned, expiring wrappers around `localStorage` / `sessionStorage`.
 *
 * Every read tolerates what browser storage actually does to you: private
 * browsing can throw on the first call, a quota can fill up mid-session, a
 * value can be hand-edited or left by an older build, and an entry can simply
 * be past its expiry. All of those are treated as "nothing saved" rather than
 * thrown — the app must keep working with or without persistence.
 */

export type StorageArea = 'local' | 'session';

export interface StoredValue<T> {
  data: T;
  /** `Date.now()` at the time this was written — lets callers judge staleness against other timestamps (e.g. a record's `updatedAt`). */
  savedAt: number;
}

interface Envelope<T> {
  v: number;
  savedAt: number;
  expiresAt: number | null;
  data: T;
}

function getStore(area: StorageArea): Storage | null {
  try {
    const store = area === 'local' ? window.localStorage : window.sessionStorage;
    // Some browsers (Safari private mode, historically) expose the API but
    // throw on the first write — probe once rather than fail on the caller's.
    const probeKey = '__growth_storage_probe__';
    store.setItem(probeKey, '1');
    store.removeItem(probeKey);
    return store;
  } catch {
    return null;
  }
}

export function readStored<T>(area: StorageArea, key: string, version: number): StoredValue<T> | null {
  const store = getStore(area);
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Envelope<T>> | null;
    if (!parsed || typeof parsed !== 'object' || parsed.v !== version || parsed.data === undefined) {
      store.removeItem(key);
      return null;
    }
    if (typeof parsed.expiresAt === 'number' && Date.now() > parsed.expiresAt) {
      store.removeItem(key);
      return null;
    }
    return { data: parsed.data, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0 };
  } catch {
    // Corrupt JSON — drop it so it doesn't keep failing on every read.
    try { store.removeItem(key); } catch { /* best effort */ }
    return null;
  }
}

export function writeStored<T>(area: StorageArea, key: string, version: number, data: T, ttlMs?: number): void {
  const store = getStore(area);
  if (!store) return;
  const envelope: Envelope<T> = {
    v: version,
    savedAt: Date.now(),
    expiresAt: ttlMs ? Date.now() + ttlMs : null,
    data,
  };
  try {
    store.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota exceeded or storage blocked mid-session — keep working without persistence.
  }
}

export function clearStored(area: StorageArea, key: string): void {
  const store = getStore(area);
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* best effort */
  }
}
