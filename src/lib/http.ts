import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import type { ApiErrorShape, User } from '@/types/domain';

type ApiEnvelope<T> =
  | T
  | { data?: T; items?: T; result?: T; payload?: T; record?: T; message?: unknown }
  | { data?: { data?: T; items?: T; result?: T; payload?: T; record?: T } };

/*
  In-memory only — deliberately not localStorage/sessionStorage.

  The access token is a bearer credential: anything that can read it can call
  the API as this user for as long as it's valid. Browser storage is readable
  by any script running on the page, so an XSS anywhere in the app (or in a
  dependency) can exfiltrate a token sitting in localStorage long after the
  page that leaked it is gone. A module-level variable is readable only by
  code running *right now*, and disappears on every navigation and refresh.

  This does not lose "stay signed in after a refresh": that guarantee comes
  from the httpOnly refresh cookie (already set by the API — this module
  never reads or writes it, the browser handles it automatically via
  `withCredentials`), not from anything client-side JS holds onto. On every
  app boot, AuthContext exchanges that cookie for a fresh access token into
  this variable — see `reloadUser`.
*/
let accessToken: string | null = null;

export const tokenStorage = {
  get(): string | null {
    return accessToken;
  },
  set(token: string): void {
    accessToken = token;
  },
  clear(): void {
    accessToken = null;
  },
};

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

let forbiddenHandler: ((requestPath: string) => void) | null = null;

/**
 * Called on every 403, with the request path that produced it.
 *
 * A role change does not reach an already–signed-in user until their token is
 * re-issued, so the UI can offer an action the API now refuses. Centralising
 * the reaction here means no screen has to special-case it: AuthContext
 * refreshes the session, and the guards re-render from the true role.
 */
export function setForbiddenHandler(handler: ((requestPath: string) => void) | null): void {
  forbiddenHandler = handler;
}

let sessionRefreshedHandler: ((user: User) => void) | null = null;

/** Notified whenever a refresh returns a user, so AuthContext can re-render. */
export function setSessionRefreshedHandler(handler: ((user: User) => void) | null): void {
  sessionRefreshedHandler = handler;
}

/*
  `withCredentials` is required, not optional. The refresh token is an httpOnly
  cookie, so without it the browser never sends the cookie and every refresh
  fails — the session would end the moment the short-lived access token expires.

  The cost is that the API must name this exact origin in its CORS allow-list
  and send `Access-Control-Allow-Credentials: true`. A wildcard
  `Access-Control-Allow-Origin: *` is rejected by the browser once credentials
  are in play, so a backend using one has to be tightened alongside this.
*/
export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.apiTimeoutMs,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

/*
  A separate client for the refresh call itself.

  It carries no interceptors, which is the point: a 401 from the refresh
  endpoint must not re-enter the refresh logic and recurse. It also sends no
  Authorization header — the expired access token is exactly what is being
  replaced; the httpOnly cookie is the credential here.
*/
const refreshClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.apiTimeoutMs,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token.
 *
 * Deduplicated on purpose. The dashboard fires a dozen widget requests at
 * once; when the access token expires they all 401 together, and without this
 * every one of them would start its own refresh — a burst of identical calls,
 * and with rotating refresh tokens all but the first would fail and sign the
 * user out. Concurrent callers share the single in-flight promise instead.
 *
 * Resolves to `null` rather than throwing when refresh is not possible, so
 * callers can treat "could not refresh" as an ordinary branch.
 */
export function refreshSession(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = requestRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function requestRefresh(): Promise<string | null> {
  try {
    const response = await refreshClient.post(apiRoutes.auth.refresh);
    const payload = unwrap<{ accessToken?: string; user?: User }>(response.data);
    if (!payload?.accessToken) return null;

    tokenStorage.set(payload.accessToken);
    if (payload.user) sessionRefreshedHandler?.(payload.user);
    return payload.accessToken;
  } catch {
    return null;
  }
}

/*
  Endpoints where a 401 is the answer, not a symptom. Retrying a rejected login
  after a refresh would be nonsense, and refreshing on a failed refresh recurses.
*/
const NO_REFRESH_PATHS = [apiRoutes.auth.login, apiRoutes.auth.refresh, apiRoutes.auth.logout, apiRoutes.auth.acceptInvitation, apiRoutes.auth.forgotPassword, apiRoutes.auth.resetPassword];

function skipsRefresh(url?: string): boolean {
  return Boolean(url && NO_REFRESH_PATHS.some((path) => url.includes(path)));
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const headers = AxiosHeaders.from(config.headers);
  headers.set('ngrok-skip-browser-warning', 'true');
  const token = tokenStorage.get();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  config.headers = headers;
  return config;
});

/** Marks a request that has already been retried, so it can only happen once. */
type RetriableConfig = InternalAxiosRequestConfig & { _refreshRetried?: boolean };

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const config = error.config as RetriableConfig | undefined;

    if (status === 401) {
      /*
        On 401: refresh once and retry. Only a *second* 401 signs the user out.

        The previous behaviour — clear the token and log out immediately — put
        the user back on the login screen every time a short-lived access token
        expired, losing whatever they were doing.
      */
      if (config && !config._refreshRetried && !skipsRefresh(config.url)) {
        config._refreshRetried = true;
        const token = await refreshSession();
        if (token) return http(config);
      }

      tokenStorage.clear();
      unauthorizedHandler?.();
    }

    if (status === 403) {
      forbiddenHandler?.(error.config?.url ?? '');
    }

    return Promise.reject(normalizeApiError(error));
  },
);

export function normalizeApiError(error: unknown): ApiErrorShape {
  if (!axios.isAxiosError(error)) {
    return { message: error instanceof Error ? error.message : 'Unexpected error.' };
  }

  const data = error.response?.data as
    | {
        message?: string | string[];
        error?: string;
        statusCode?: number;
        code?: string;
        from?: string;
        errors?: Record<string, string | string[]>;
      }
    | undefined;

  const messageValue = data?.message ?? data?.error;
  const message = Array.isArray(messageValue)
    ? messageValue.join('\n')
    : messageValue || error.message || 'Request failed.';

  const fieldErrors: Record<string, string> = {};
  if (Array.isArray(data?.message)) {
    data.message.forEach((entry) => {
      const [field, ...rest] = entry.split(' ');
      if (field && rest.length) fieldErrors[field] = entry;
    });
  }
  if (data?.errors) {
    Object.entries(data.errors).forEach(([field, value]) => {
      fieldErrors[field] = Array.isArray(value) ? value.join('\n') : value;
    });
  }

  /*
    Did this response come from the API, or from something in front of it?
    A NestJS error is a JSON object; an offline tunnel, a proxy or a CDN
    answers with an HTML page. Callers that interpret a status code as a
    contract state — the admin dashboard treats 404 as "not shipped yet" —
    must not do that for a status invented by the infrastructure.
  */
  const isApiResponse = Boolean(error.response) && typeof data === 'object' && data !== null;

  const networkMessage = !error.response
    ? 'Network error. Check that the backend is running, the API base URL is correct, and CORS allows this frontend origin.'
    : isApiResponse
      ? message
      : `The API base URL did not return a valid API response (HTTP ${error.response?.status}). Check that VITE_API_BASE_URL points at a running backend.`;

  return {
    message: networkMessage,
    statusCode: data?.statusCode ?? error.response?.status,
    code: typeof data?.code === 'string' ? data.code : undefined,
    from: typeof data?.from === 'string' ? data.from : undefined,
    fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
    isApiResponse,
  };
}

export function errorMessage(error: unknown): string {
  return (error as ApiErrorShape | undefined)?.message ?? 'Something went wrong.';
}

/** The API's machine-readable reason, if it sent one. Compare against a code constant, never a message. */
export function errorCode(error: unknown): string | undefined {
  return (error as ApiErrorShape | undefined)?.code;
}

/** True for a 409 — somebody else already acted. The right move is to refresh, not retry. */
export function isConflict(error: unknown): boolean {
  return (error as ApiErrorShape | undefined)?.statusCode === 409;
}

/*
  Nest answers an unmatched route with `Cannot <VERB> <path>`; a controller
  answering 404 for a record that does not exist sends a domain message
  instead. Both are 404s with a JSON body, and telling them apart matters:
  "this endpoint has not shipped" and "this record is already gone" call for
  opposite reactions on a destructive action.
*/
const ROUTE_MISS_MESSAGE = /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i;

/** True when a 404 means "no such route", not "no such record". */
export function isRouteMissing(error: unknown): boolean {
  const apiError = error as ApiErrorShape | undefined;
  return (
    apiError?.statusCode === 404 &&
    Boolean(apiError.isApiResponse) &&
    ROUTE_MISS_MESSAGE.test(apiError.message ?? '')
  );
}

/**
 * Rewrites a route-miss 404 into something a user can act on.
 *
 * Without this, an unshipped SPEC endpoint surfaces as the raw
 * "Cannot PATCH /api/users/…/platform-role" — accurate, and meaningless to
 * anyone who is not reading the router.
 */
export function notShippedError(error: unknown, message: string): ApiErrorShape {
  return { ...(error as ApiErrorShape), message };
}

export function unwrap<T>(value: ApiEnvelope<T>): T {
  if (!value || typeof value !== 'object') return value as T;

  const object = value as Record<string, unknown>;
  const preferredKeys = ['data', 'items', 'result', 'payload', 'record'] as const;

  for (const key of preferredKeys) {
    const inner = object[key];
    if (Array.isArray(inner)) return inner as T;
    if (inner && typeof inner === 'object') {
      const nested = inner as Record<string, unknown>;
      for (const nestedKey of preferredKeys) {
        const nestedValue = nested[nestedKey];
        if (Array.isArray(nestedValue) || (nestedValue && typeof nestedValue === 'object')) return nestedValue as T;
      }
      return inner as T;
    }
  }

  return value as T;
}

export function unwrapList<T>(value: unknown): T[] {
  const data = unwrap<unknown>(value);
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const object = data as Record<string, unknown>;
    for (const key of ['items', 'data', 'result', 'records'] as const) {
      if (Array.isArray(object[key])) return object[key] as T[];
    }
  }
  return [];
}