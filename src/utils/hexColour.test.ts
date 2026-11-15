import { describe, expect, it } from 'vitest';
import { isHexColour, normalizeHex } from './hexColour';

describe('normalizeHex (N-14)', () => {
  it('keeps six digits, lower-cased, with a "#"', () => {
    expect(normalizeHex('#c9144b')).toBe('#c9144b');
    expect(normalizeHex('#C9144B')).toBe('#c9144b');
    expect(normalizeHex('C9144B')).toBe('#c9144b');
    expect(normalizeHex('c9144b')).toBe('#c9144b');
  });

  it('expands three digits to the same colour', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(normalizeHex('#FfF')).toBe('#ffffff');
    expect(normalizeHex('#000')).toBe('#000000');
  });

  it('ignores surrounding spaces', () => {
    expect(normalizeHex('  #C9144B ')).toBe('#c9144b');
  });

  it('is null for anything that is not a hex colour, never black', () => {
    for (const value of ['', '#', '#12', '#1234', '#12345', '#1234567', 'red', '#ggg', '##abc', 'rgb(0,0,0)', null, undefined]) {
      expect(normalizeHex(value), String(value)).toBeNull();
    }
  });
});

describe('isHexColour', () => {
  it('accepts exactly what normalizeHex can normalise', () => {
    for (const value of ['#abc', 'abc', '#AABBCC', 'aabbcc', ' #abc ']) expect(isHexColour(value), value).toBe(true);
    for (const value of ['', '#ab', 'abcd', '#abcdef0', 'blue']) expect(isHexColour(value), value).toBe(false);
  });
});
