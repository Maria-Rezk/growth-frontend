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
  register: '/register',
  acceptInvitation: '/accept-invitation',
  dashboard: '/dashboard',
  createCompany: '/create-company',
  members: '/members',
} as const;

/**
 * Absolute, shareable URL for an invitation.
 *
 * Built with `URL` rather than string concatenation so the token is
 * percent-encoded — tokens are opaque and may contain characters that would
 * otherwise terminate the query string.
 */
export function invitationAcceptUrl(token: string, origin: string = window.location.origin): string {
  const url = new URL(appRoutes.acceptInvitation, origin);
  url.searchParams.set('token', token);
  return url.toString();
}
