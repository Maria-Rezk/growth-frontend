import { describe, expect, it } from 'vitest';
import { isApplePlatform, modShortcut } from './platform';

const nav = (platform: string, userAgent = '', hint?: string) => ({ platform, userAgent, ...(hint === undefined ? {} : { userAgentData: { platform: hint } }) });

describe('isApplePlatform', () => {
  it('is true on macOS and iOS', () => {
    expect(isApplePlatform(nav('MacIntel'))).toBe(true);
    expect(isApplePlatform(nav('iPhone'))).toBe(true);
    expect(isApplePlatform(nav('iPad'))).toBe(true);
    expect(isApplePlatform(nav('', '', 'macOS'))).toBe(true);
  });

  it('is false on Windows and Linux', () => {
    expect(isApplePlatform(nav('Win32'))).toBe(false);
    expect(isApplePlatform(nav('Linux x86_64'))).toBe(false);
    expect(isApplePlatform(nav('', '', 'Windows'))).toBe(false);
    expect(isApplePlatform(nav('', '', 'Linux'))).toBe(false);
  });

  it('prefers Client Hints over the legacy platform string', () => {
    expect(isApplePlatform(nav('MacIntel', '', 'Windows'))).toBe(false);
  });

  it('falls back to the user agent, then to "not Apple"', () => {
    expect(isApplePlatform(nav('', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'))).toBe(true);
    expect(isApplePlatform(nav('', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'))).toBe(false);
    expect(isApplePlatform(undefined)).toBe(false);
  });
});

describe('modShortcut', () => {
  it('spells ⌘K on Apple platforms', () => {
    expect(modShortcut('k', true)).toEqual({ keys: '⌘K', label: '⌘K', aria: 'Meta+K' });
  });

  it('spells Ctrl+K elsewhere', () => {
    expect(modShortcut('k', false)).toEqual({ keys: 'Ctrl K', label: 'Ctrl+K', aria: 'Control+K' });
  });
});
