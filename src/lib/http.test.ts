import { describe, expect, it } from 'vitest';
import { normalizeApiError } from '@/lib/http';

/**
 * Builds a minimal object that `axios.isAxiosError` accepts, so these tests
 * exercise the real branching without a network round-trip.
 */
function axiosError(status: number | undefined, data: unknown) {
  return {
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    response: status === undefined ? undefined : { status, data },
  };
}

describe('normalizeApiError', () => {
  it('marks a JSON error body as coming from the API', () => {
    const error = normalizeApiError(
      axiosError(404, { statusCode: 404, message: 'Cannot GET /api/admin/dashboard/overview', error: 'Not Found' }),
    );

    expect(error.statusCode).toBe(404);
    expect(error.isApiResponse).toBe(true);
    expect(error.message).toContain('Cannot GET');
  });

  /*
    The case that matters: an offline ngrok tunnel answers 404 with an HTML
    page for every path, including endpoints that exist. Treating that as a
    contract state would render the whole admin dashboard as "Not available
    yet" and hide an unreachable backend.
  */
  it('does not mark an HTML error page as coming from the API', () => {
    const error = normalizeApiError(axiosError(404, '<!DOCTYPE html><html>ERR_NGROK_3200</html>'));

    expect(error.statusCode).toBe(404);
    expect(error.isApiResponse).toBe(false);
    expect(error.message).toContain('VITE_API_BASE_URL');
  });

  it('reports a missing response as a network error', () => {
    const error = normalizeApiError(axiosError(undefined, undefined));

    expect(error.isApiResponse).toBe(false);
    expect(error.message).toContain('Network error');
  });

  it('keeps field errors from a validation response', () => {
    const error = normalizeApiError(
      axiosError(400, { statusCode: 400, errors: { name: 'name must be longer than 2 characters' } }),
    );

    expect(error.isApiResponse).toBe(true);
    expect(error.fieldErrors).toEqual({ name: 'name must be longer than 2 characters' });
  });
});
