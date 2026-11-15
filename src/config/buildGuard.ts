/*
  What may be built (N-19). A demo bundle signs every visitor in as a demo
  admin, so it must never be what a real deployment serves. The build mode is
  the only authority: `npm run build:demo` (`vite build --mode demo`) is the
  one way to make a demo bundle, and it writes to dist-demo, never dist. No
  variable can turn a production or staging build into one. Anything
  contradictory or unrecognised fails the build. Dev servers and the
  Playwright runs use `vite serve` and are not affected.
*/

export const DEMO_BUILD_MODE = 'demo';

/** Why this build must not run, or null when it may. */
export function demoBuildProblem(command: 'build' | 'serve', mode: string, env: Record<string, string | undefined>): string | null {
  if (command !== 'build') return null;

  const flag = env.VITE_DEMO_MODE;
  if (flag !== undefined && flag !== '' && flag !== 'false' && flag !== 'true') {
    return `VITE_DEMO_MODE must be "true" or "false", not "${flag}".`;
  }

  if (mode !== DEMO_BUILD_MODE) {
    if (flag !== 'true') return null;
    return (
      `VITE_DEMO_MODE=true in a "${mode}" build: every visitor would get the demo workspace, signed in as a demo admin. `
      + 'Unset it for a real build. A demo deployment is built with `npm run build:demo`.'
    );
  }

  if (flag !== 'true') return `A "${DEMO_BUILD_MODE}" build needs VITE_DEMO_MODE=true (see .env.demo), not "${flag ?? ''}".`;
  // Relative, so no real API address is in a demo bundle at all. The fake backend answers every request anyway.
  if (!/^\/(?!\/)/.test(env.VITE_API_BASE_URL ?? '')) {
    return `A "${DEMO_BUILD_MODE}" build must use a relative VITE_API_BASE_URL such as /api (see .env.demo), not "${env.VITE_API_BASE_URL ?? ''}".`;
  }
  return null;
}
