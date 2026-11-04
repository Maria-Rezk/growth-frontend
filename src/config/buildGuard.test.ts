import { describe, expect, it } from 'vitest';
import { demoBuildProblem } from './buildGuard';

const DEMO_ENV = { VITE_DEMO_MODE: 'true', VITE_API_BASE_URL: '/api' };

describe('demoBuildProblem (N-19)', () => {
  it('refuses demo mode in production and staging builds', () => {
    expect(demoBuildProblem('build', 'production', { VITE_DEMO_MODE: 'true' })).toMatch(/"production" build/);
    expect(demoBuildProblem('build', 'staging', { VITE_DEMO_MODE: 'true' })).toMatch(/"staging" build/);
  });

  it('lets no variable authorise it: the old allowance flag, or a demo-looking env, changes nothing', () => {
    expect(demoBuildProblem('build', 'production', { VITE_DEMO_MODE: 'true', VITE_ALLOW_DEMO_BUILD: 'true' })).not.toBeNull();
    expect(demoBuildProblem('build', 'production', { ...DEMO_ENV, VITE_ALLOW_DEMO_BUILD: 'true' })).not.toBeNull();
  });

  it('allows every real build', () => {
    for (const value of [undefined, '', 'false']) {
      expect(demoBuildProblem('build', 'production', { VITE_DEMO_MODE: value }), String(value)).toBeNull();
      expect(demoBuildProblem('build', 'staging', { VITE_DEMO_MODE: value }), String(value)).toBeNull();
    }
  });

  it('fails closed on a value it does not recognise, in any mode', () => {
    for (const value of ['TRUE', '1', 'yes', ' true']) {
      expect(demoBuildProblem('build', 'production', { VITE_DEMO_MODE: value }), value).toMatch(/must be "true" or "false"/);
      expect(demoBuildProblem('build', 'demo', { ...DEMO_ENV, VITE_DEMO_MODE: value }), value).toMatch(/must be "true" or "false"/);
    }
  });

  it('allows the dedicated demo target', () => {
    expect(demoBuildProblem('build', 'demo', DEMO_ENV)).toBeNull();
  });

  it('refuses a demo target that contradicts itself', () => {
    for (const value of [undefined, '', 'false']) {
      expect(demoBuildProblem('build', 'demo', { ...DEMO_ENV, VITE_DEMO_MODE: value }), String(value)).toMatch(/needs VITE_DEMO_MODE=true/);
    }
  });

  it('refuses a demo target that names a real API, or none', () => {
    for (const value of ['https://api.solu1ions.tech', 'http://localhost:3000/api', '//api.solu1ions.tech', '', undefined]) {
      expect(demoBuildProblem('build', 'demo', { ...DEMO_ENV, VITE_API_BASE_URL: value }), String(value)).toMatch(/relative VITE_API_BASE_URL/);
    }
  });

  it('never affects the dev server, where demo mode is how the E2E suites run', () => {
    expect(demoBuildProblem('serve', 'development', { VITE_DEMO_MODE: 'true' })).toBeNull();
    expect(demoBuildProblem('serve', 'test', { VITE_DEMO_MODE: 'yes' })).toBeNull();
  });
});
