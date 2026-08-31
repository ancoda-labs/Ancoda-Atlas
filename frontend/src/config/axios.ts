import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * The shared HTTP client for every call to the Atlas API.
 *
 * Two base URLs exist for one reason: they are read at different times by
 * different things.
 *
 *   NEXT_PUBLIC_API_BASE_URL is baked into the browser bundle at BUILD time and
 *   must be an address a reader's browser can reach.
 *
 *   Left empty — which is the default in development — this falls back to
 *   /api/v1 on the frontend's own origin, and next.config.mjs rewrites that to
 *   the API container. Same-origin means no CORS preflight on a mobile
 *   connection where a round trip is expensive.
 */
const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
export const API_BASE = configured ? `${configured.replace(/\/+$/, '')}/api/v1` : '/api/v1';

/** Where the live sweep stream lives. Not versioned — it is a stream, not a resource. */
export const EVENTS_URL = configured ? `${configured.replace(/\/+$/, '')}/events` : '/events';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  // Long enough for the register routes, which return sixteen thousand rows,
  // and short enough that a hung request does not pin a panel on its spinner.
  timeout: 30_000,
});

/**
 * Atlas has no accounts, so there is no token to attach and no 401 to refresh.
 * What the interceptor does instead is give every failure one shape, so a
 * caller never has to tell an axios error from a network error from a
 * `{ error }` body.
 */
export interface ApiError {
  status: number | null;
  code: string;
  message: string;
}

function normalise(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) {
    return { status: null, code: 'unknown', message: 'Something went wrong.' };
  }
  const axiosError = error as AxiosError<{ error?: { code?: string; message?: string } | string }>;
  const status = axiosError.response?.status ?? null;

  if (!axiosError.response) {
    // No response at all: offline, DNS, or the API is down. Worth saying
    // differently from a 500, because the reader can act on it.
    return {
      status: null,
      code: 'offline',
      message: 'Could not reach the Atlas API. Check your connection.',
    };
  }

  const body = axiosError.response.data?.error;
  if (typeof body === 'string') return { status, code: body, message: body };
  return {
    status,
    code: body?.code ?? 'http_error',
    message: body?.message ?? `Request failed (${status}).`,
  };
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => config);

api.interceptors.response.use(
  response => response,
  error => Promise.reject(normalise(error)),
);

export { normalise as normaliseApiError };
export default api;
