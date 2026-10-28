import { describe, expect, it } from 'vitest';
import { devTargetsProduction, isNgrokUrl, needsNgrokBypass } from '@/config/env';

describe('devTargetsProduction', () => {
  it('is false for a dev build on a local backend', () => {
    expect(devTargetsProduction(true, 'http://localhost:3000/api', '')).toBe(false);
  });

  it('flags a dev build calling the production API directly', () => {
    expect(devTargetsProduction(true, 'https://api.solu1ions.tech/api', undefined)).toBe(true);
  });

  it('flags a dev build proxying to the production API', () => {
    expect(devTargetsProduction(true, '/api', 'https://api.solu1ions.tech')).toBe(true);
  });

  it('never flags a production build', () => {
    expect(devTargetsProduction(false, 'https://api.solu1ions.tech/api', undefined)).toBe(false);
  });
});

describe('isNgrokUrl', () => {
  it.each([
    ['https://abc123.ngrok-free.app/api', true],
    ['https://abc123.ngrok.app', true],
    ['https://abc123.ngrok.io/api', true],
    ['https://abc123.ngrok-free.dev', true],
    ['https://api.solu1ions.tech/api', false],
    ['http://localhost:3000/api', false],
    ['/api', false],
    ['https://ngrok.app.evil.example.com', false],
    ['https://notngrok.app', false],
    ['', false],
    [undefined, false],
  ])('%s → %s', (value, expected) => {
    expect(isNgrokUrl(value)).toBe(expected);
  });
});

describe('needsNgrokBypass', () => {
  it('is true for an ngrok API in any build', () => {
    expect(needsNgrokBypass(false, 'https://abc.ngrok-free.app/api', undefined)).toBe(true);
  });

  it('is true for a dev proxy to ngrok, and only in dev', () => {
    expect(needsNgrokBypass(true, '/api', 'https://abc.ngrok.app')).toBe(true);
    expect(needsNgrokBypass(false, '/api', 'https://abc.ngrok.app')).toBe(false);
  });

  it('is false for the production API', () => {
    expect(needsNgrokBypass(false, 'https://api.solu1ions.tech/api', undefined)).toBe(false);
  });
});
