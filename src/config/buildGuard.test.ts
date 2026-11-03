import { describe, expect, it } from 'vitest';
import { demoBuildProblem } from './buildGuard';

describe('demoBuildProblem (N-19)', () => {
  it('refuses a production build with demo mode on', () => {
    expect(demoBuildProblem('build', { VITE_DEMO_MODE: 'true' })).toMatch(/VITE_ALLOW_DEMO_BUILD=true/);
  });

  it('allows it when the build says it is a demo deployment', () => {
    expect(demoBuildProblem('build', { VITE_DEMO_MODE: 'true', VITE_ALLOW_DEMO_BUILD: 'true' })).toBeNull();
  });

  it('allows every real build', () => {
    for (const value of [undefined, '', 'false', 'TRUE', '1']) expect(demoBuildProblem('build', { VITE_DEMO_MODE: value }), String(value)).toBeNull();
  });

  it('never affects the dev server, where demo mode is how the E2E suites run', () => {
    expect(demoBuildProblem('serve', { VITE_DEMO_MODE: 'true' })).toBeNull();
  });
});
