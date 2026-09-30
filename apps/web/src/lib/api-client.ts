import {
  AUTH_COOKIES,
  CSRF_HEADER,
  type ApiErrorResponse,
  type ApiFieldError,
  type ApiResponse,
  type PaginationMeta,
} from '@zyventa/shared';
import { apiBaseUrl } from './env';

/**
 * The single HTTP client for the Express API. Services in `src/services` wrap it; components
 * never call fetch directly (enforced by ESLint).
 *
 * - Sends cookies (`credentials: 'include'`) — auth tokens live in HttpOnly cookies.
 * - Browser only: bootstraps the CSRF cookie and echoes it in `X-CSRF-Token` on writes.
 * - Browser only: on 401 it refreshes the session ONCE (single-flight across concurrent
 *   calls) and retries; if refresh fails, session-expired listeners are notified.
 * - Unwraps the `{ success, data }` envelope and throws `ApiClientError` for failures.
 */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];

export interface RequestOptions {
  method?: HttpMethod;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Next.js data-cache controls for server components. */
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
  /** Don't attempt a token refresh on 401 (login, register, refresh itself…). */
  skipAuthRefresh?: boolean;
}

export interface ApiResult<T> {
  data: T;
  message: string;
  pagination?: PaginationMeta;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorResponse['code'] | 'NETWORK_ERROR' | 'INVALID_RESPONSE';
  readonly errors: ApiFieldError[];
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: ApiClientError['code'],
    message: string,
    errors: ApiFieldError[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.requestId = requestId;
  }

  /** 4xx errors are the caller's fault and should not be retried automatically. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

export function readCookie(name: string): string | undefined {
  if (!isBrowser()) return undefined;
  const row = document.cookie.split('; ').find((entry) => entry.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : undefined;
}

/** True when the API has told this browser a session exists (non-secret hint cookie). */
export function hasSessionHint(): boolean {
  return readCookie(AUTH_COOKIES.sessionHint) === '1';
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${apiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) url.searchParams.set(key, value.join(','));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function isEnvelope(value: unknown): value is ApiResponse<unknown> {
  return typeof value === 'object' && value !== null && 'success' in value;
}

/** One HTTP round trip: no CSRF bootstrap, no refresh. */
async function sendOnce<T>(path: string, options: RequestOptions): Promise<ApiResult<T>> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body; // browser sets the multipart boundary
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  if (method !== 'GET') {
    const csrf = readCookie(AUTH_COOKIES.csrf);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  const url = buildUrl(path, options.query); // outside try: a bad URL is a bug, not a network error
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: options.signal,
      ...(options.cache ? { cache: options.cache } : {}),
      ...(options.next ? { next: options.next } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (!isBrowser()) {
      // Server-side (SSR/RSC): surface the root cause in server logs; the UI stays generic.
      console.error(`[api-client] ${method} ${path} failed:`, error);
    }
    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      'Unable to reach the server. Check your connection.',
    );
  }

  let payload: unknown;
  try {
    payload =
      response.status === 204
        ? { success: true, message: 'OK', data: null }
        : await response.json();
  } catch {
    throw new ApiClientError(
      response.status,
      'INVALID_RESPONSE',
      'Unexpected response from server',
    );
  }

  if (!isEnvelope(payload)) {
    throw new ApiClientError(
      response.status,
      'INVALID_RESPONSE',
      'Unexpected response from server',
    );
  }

  if (!payload.success) {
    throw new ApiClientError(
      response.status,
      payload.code,
      payload.message,
      payload.errors ?? [],
      payload.requestId,
    );
  }

  // A 503 readiness report is still a well-formed success envelope; callers inspect `data`.
  return {
    data: payload.data as T,
    message: payload.message,
    ...(payload.pagination ? { pagination: payload.pagination } : {}),
  };
}

// ── CSRF bootstrap (single-flight) ──────────────────────────────────────────
let csrfInFlight: Promise<void> | null = null;

async function ensureCsrfCookie(force = false): Promise<void> {
  if (!force && readCookie(AUTH_COOKIES.csrf)) return;
  csrfInFlight ??= sendOnce('/auth/csrf', { method: 'GET', cache: 'no-store' })
    .then(() => undefined)
    .finally(() => {
      csrfInFlight = null;
    });
  return csrfInFlight;
}

// ── Session refresh (single-flight) ─────────────────────────────────────────
let refreshInFlight: Promise<boolean> | null = null;
const sessionExpiredListeners = new Set<() => void>();

/** Called when a refresh fails — the auth provider clears the cached user. */
export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      await ensureCsrfCookie();
      await sendOnce('/auth/refresh', { method: 'POST', cache: 'no-store' });
      return true;
    } catch {
      sessionExpiredListeners.forEach((listener) => {
        listener();
      });
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

const REFRESHABLE = new Set(['UNAUTHENTICATED', 'TOKEN_EXPIRED']);

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const method = options.method ?? 'GET';
  if (!isBrowser()) return sendOnce<T>(path, options);

  if (method !== 'GET') await ensureCsrfCookie();

  try {
    return await sendOnce<T>(path, options);
  } catch (error) {
    if (!(error instanceof ApiClientError)) throw error;

    // CSRF cookie expired or rotated: fetch a fresh one and retry once.
    if (error.code === 'CSRF_INVALID' && method !== 'GET') {
      await ensureCsrfCookie(true);
      return sendOnce<T>(path, options);
    }

    // Access token expired (cookie dropped at max-age, or JWT expired): refresh once, retry.
    if (
      error.status === 401 &&
      REFRESHABLE.has(error.code) &&
      !options.skipAuthRefresh &&
      hasSessionHint() &&
      (await refreshSession())
    ) {
      return sendOnce<T>(path, options);
    }
    throw error;
  }
}

type NoBody = Omit<RequestOptions, 'method' | 'body'>;

export const apiClient = {
  get: <T>(path: string, options?: NoBody) => apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: NoBody) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: NoBody) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: NoBody) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: NoBody) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
