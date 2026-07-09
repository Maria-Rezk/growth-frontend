import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import type { ApiErrorShape } from '@/types/domain';

const ACCESS_TOKEN_KEY = 'growth.accessToken';

type ApiEnvelope<T> =
  | T
  | { data?: T; items?: T; result?: T; payload?: T; record?: T; message?: unknown }
  | { data?: { data?: T; items?: T; result?: T; payload?: T; record?: T } };

export const tokenStorage = {
  get(): string | null {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  set(token: string): void {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  },
  clear(): void {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  },
};

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.apiTimeoutMs,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

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

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      tokenStorage.clear();
      unauthorizedHandler?.();
    }
    return Promise.reject(normalizeApiError(error));
  },
);

export function normalizeApiError(error: unknown): ApiErrorShape {
  if (!axios.isAxiosError(error)) {
    return { message: error instanceof Error ? error.message : 'Unexpected error.' };
  }

  const data = error.response?.data as
    | { message?: string | string[]; error?: string; statusCode?: number; errors?: Record<string, string | string[]> }
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

  const networkMessage = !error.response
    ? 'Network error. Check that the backend is running, the API base URL is correct, and CORS allows this frontend origin.'
    : message;

  return {
    message: networkMessage,
    statusCode: data?.statusCode ?? error.response?.status,
    fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
  };
}

export function errorMessage(error: unknown): string {
  return (error as ApiErrorShape | undefined)?.message ?? 'Something went wrong.';
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