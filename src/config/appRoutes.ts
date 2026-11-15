/**
 * Frontend route paths.
 *
 * Deliberately separate from `apiRoutes` — they are not interchangeable. The
 * invitations API returns an `acceptPath` of `/auth/accept-invitation`, which
 * is a *backend* path; pasting it onto the app origin produces a 404. Anything
 * a user is meant to open in a browser must be built from this file.
 */
export const appRoutes = {
  login: '/login',
  acceptInvitation: '/accept-invitation',
  forgotPassword: '/forgot-password',
  myWork: '/my-work',
  /** The client portal's landing page — what is waiting on the client, and what was delivered. */
  clientHome: '/home',
  posts: '/posts',
  post: (postId: string) => `/posts/${postId}`,
  reports: '/reports',
  report: (reportId: string) => `/reports/${reportId}`,
  /** Login-free report view. The backend mints the full URL; this is for routing and demo only. */
  publicReportPattern: '/r/:token',
  publicReport: (token: string) => `/r/${encodeURIComponent(token)}`,
  leads: '/leads',
  campaigns: '/campaigns',
  contentPlans: '/content-plans',
  contentPlan: (planId: string) => `/content-plans/${planId}`,
  brandProfile: '/brand-profile',
  approvals: '/approvals',
  tasks: '/tasks',
  task: (taskId: string) => `/tasks/${taskId}`,
  responsibilities: '/responsibilities',
  automations: '/automations',
  dashboard: '/dashboard',
  members: '/members',
  adminDashboard: '/admin/dashboard',
  adminActivity: '/admin/activity',
  adminEmployees: '/admin/employees',
  adminClients: '/admin/clients',
} as const;

/**
 * Unwraps a raw invitation token that is actually a full accept URL.
 *
 * The API contract is that `invitationToken` is the bare `<id>.<secret>`
 * token, but if the backend ever hands back a full accept link instead (as
 * happened once — see the accept-invitation token bug), building a shareable
 * URL from it would nest the link inside itself: `?token=<url>?token=<id>...`.
 * Pulling the inner `token` param back out keeps the link valid either way.
 */
export function unwrapInvitationToken(raw: string): string {
  const value = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  try {
    const inner = new URL(value).searchParams.get('token');
    return inner ? unwrapInvitationToken(inner) : value;
  } catch {
    return value;
  }
}

/**
 * Absolute, shareable URL for an invitation.
 *
 * Built with `URL` rather than string concatenation so the token is
 * percent-encoded — tokens are opaque and may contain characters that would
 * otherwise terminate the query string.
 */
export function invitationAcceptUrl(token: string, origin: string = window.location.origin): string {
  const url = new URL(appRoutes.acceptInvitation, origin);
  url.searchParams.set('token', unwrapInvitationToken(token));
  return url.toString();
}

/** Pages a person must never be sent back to after signing in. */
const AUTH_PAGES: readonly string[] = [appRoutes.login, appRoutes.forgotPassword, appRoutes.acceptInvitation];

/**
 * Where to go after signing in: the page that asked for it, in full.
 *
 * ProtectedRoute hands the login page the blocked location (pathname, search
 * and hash). Only the pathname used to be read back, so a filtered list
 * (`/leads?status=INTERESTED`) came back unfiltered. This keeps all three,
 * and accepts only a path on this app: anything that would leave the origin
 * (`//evil.example`, `https://…`, a backslash trick) or loop back to an auth
 * page falls back to `fallback`, the role-aware home.
 */
export function safeReturnPath(from: unknown, fallback = '/'): string {
  if (!from || typeof from !== 'object') return fallback;
  const { pathname, search, hash } = from as { pathname?: unknown; search?: unknown; hash?: unknown };
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\')) return fallback;
  if (AUTH_PAGES.includes(pathname)) return fallback;
  const query = typeof search === 'string' && search.startsWith('?') ? search : '';
  const fragment = typeof hash === 'string' && hash.startsWith('#') ? hash : '';
  try {
    // Resolved against this origin: whatever it parses to must stay on it.
    const base = window.location.origin;
    const url = new URL(`${pathname}${query}${fragment}`, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
