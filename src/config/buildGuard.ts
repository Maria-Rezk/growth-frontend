/*
  A production build with demo mode on would ship every visitor a signed-in
  demo platform admin and sample data instead of the real app (N-19). The
  fake token cannot reach real data, but nothing in the build said so. A
  demo deployment, which is a real need, says so explicitly with
  VITE_ALLOW_DEMO_BUILD=true. Dev servers and the Playwright runs use
  `vite serve` and are not affected.
*/

/** Why this build must not run, or null when it may. */
export function demoBuildProblem(command: 'build' | 'serve', env: Record<string, string | undefined>): string | null {
  if (command !== 'build' || env.VITE_DEMO_MODE !== 'true') return null;
  if (env.VITE_ALLOW_DEMO_BUILD === 'true') return null;
  return (
    'VITE_DEMO_MODE=true in a production build: every visitor would get the demo workspace, signed in as a demo admin. '
    + 'Unset it for a real build, or set VITE_ALLOW_DEMO_BUILD=true if this build is meant to be a demo deployment.'
  );
}
