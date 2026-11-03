import { describe, expect, it } from 'vitest';
import { env } from './env';

describe('unit tests run against the real code paths (N-18)', () => {
  it('demo mode is off, whatever .env or the shell say', () => {
    expect(import.meta.env.VITE_DEMO_MODE).toBe('false');
    expect(env.demoMode).toBe(false);
  });
});
