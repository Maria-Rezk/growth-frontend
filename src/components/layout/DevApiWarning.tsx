import { env, PRODUCTION_API_HOST } from '@/config/env';

/**
 * A red ribbon on every page of a dev build that talks to the production API.
 *
 * Local development defaults to a local backend (see .env.development), but an
 * override can still point it at production. When it does, nothing on screen
 * used to say so — and a test click on Approve or Delete changed real client
 * data. Never rendered in a production build.
 */
export function DevApiWarning() {
  if (!env.devTargetsProduction) return null;
  return (
    <div className="dev-api-warning" role="alert">
      PRODUCTION API — this dev build reads and writes live data on {PRODUCTION_API_HOST}.
    </div>
  );
}
