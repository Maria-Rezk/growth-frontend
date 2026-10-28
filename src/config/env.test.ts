import { describe, expect, it } from 'vitest';
import { devTargetsProduction } from '@/config/env';

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
