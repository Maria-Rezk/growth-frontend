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
  myWork: '/my-work',
  dashboard: '/dashboard',
  members: '/members',
  adminDashboard: '/admin/dashboard',
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
