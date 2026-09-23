// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStored, readStored, writeStored } from './storage';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('readStored / writeStored', () => {
  it('round-trips a value written at the same version', () => {
    writeStored('local', 'k', 1, { hello: 'world' });
    const result = readStored<{ hello: string }>('local', 'k', 1);
    expect(result?.data).toEqual({ hello: 'world' });
    expect(result?.savedAt).toBeGreaterThan(0);
  });

  it('keeps local and session storage separate', () => {
    writeStored('local', 'k', 1, 'from-local');
    expect(readStored('session', 'k', 1)).toBeNull();
    expect(readStored('local', 'k', 1)?.data).toBe('from-local');
  });

  it('drops a value written under a different version and removes it', () => {
    writeStored('local', 'k', 1, 'old-shape');
    expect(readStored('local', 'k', 2)).toBeNull();
    // A version bump means the old shape is gone for good, not just ignored —
    // otherwise a later write at the old version would resurrect stale data.
    expect(window.localStorage.getItem('k')).toBeNull();
  });

  it('drops an entry past its expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    writeStored('local', 'k', 1, 'value', 1000);

    vi.setSystemTime(500);
    expect(readStored('local', 'k', 1)?.data).toBe('value');

    vi.setSystemTime(1001);
    expect(readStored('local', 'k', 1)).toBeNull();
  });

  it('treats corrupt JSON as nothing saved, without throwing', () => {
    window.localStorage.setItem('k', '{not json');
    expect(() => readStored('local', 'k', 1)).not.toThrow();
    expect(readStored('local', 'k', 1)).toBeNull();
    // Cleaned up so it doesn't keep failing to parse on every future read.
    expect(window.localStorage.getItem('k')).toBeNull();
  });

  it('survives a storage.setItem that throws (quota exceeded / blocked)', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      expect(() => writeStored('local', 'k', 1, 'value')).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
    expect(readStored('local', 'k', 1)).toBeNull();
  });

  it('clearStored removes the entry', () => {
    writeStored('local', 'k', 1, 'value');
    clearStored('local', 'k');
    expect(readStored('local', 'k', 1)).toBeNull();
  });
});
