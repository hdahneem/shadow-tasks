import { useConnectionStore } from '../store/useConnectionStore';
import { buildCandidates, orderCandidates } from '../lib/connectionCandidates';

const RETRY_COOLDOWN_MS = 10_000;
const CANDIDATE_TIMEOUT_MS = 5_000;
const DEFAULT_URL = 'http://localhost:4000/api/v1';

// Wi-Fi is the primary candidate; USB is set only for native mobile builds —
// an `adb reverse tcp:4000 tcp:4000` tunnel (see scripts/start.sh) makes the
// phone's own localhost:4000 reach this same backend over the USB cable,
// independent of Wi-Fi entirely. On desktop dev both resolve to the same
// origin, so buildCandidates collapses them to a single candidate.
const candidates = buildCandidates([
  { url: import.meta.env.VITE_API_URL ?? DEFAULT_URL, type: 'wifi' },
  { url: import.meta.env.VITE_API_URL_USB ?? DEFAULT_URL, type: 'usb' },
]);
useConnectionStore.getState().setCandidateCount(candidates.length);

function orderedCandidates() {
  return orderCandidates(candidates, Date.now(), RETRY_COOLDOWN_MS);
}

async function fetchWithFallback(path: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (const candidate of orderedCandidates()) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CANDIDATE_TIMEOUT_MS);
    try {
      const res = await fetch(`${candidate.url}${path}`, { ...init, signal: controller.signal });
      candidate.lastFailedAt = null;
      useConnectionStore.getState().setConnectionType(candidate.type);
      return res;
    } catch (err) {
      candidate.lastFailedAt = Date.now();
      lastErr = err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastErr;
}

/** Uploaded files (attachments, cover images) are served from the API origin, not
 * under /api/v1 — resolve their server-relative URLs against whichever candidate's
 * origin last worked, so they load correctly over Wi-Fi or the USB fallback alike. */
export function resolveAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const active = orderedCandidates()[0];
  return `${active.origin}${url}`;
}

const ACCESS_KEY = 'shadow-tasks:access-token';
const REFRESH_KEY = 'shadow-tasks:refresh-token';
const USER_KEY = 'shadow-tasks:cached-user';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Last-known `/auth/me` response, used so a cold start while offline can stay
 * signed in against cached data instead of bouncing to the login screen. */
export const userCache = {
  get<T>(): T | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  },
  set(user: unknown) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) return err.message;
  // A raw (non-ApiError) failure here means fetch() itself threw — the request
  // never reached the server. Every feature without offline support (attachments,
  // comments, custom fields, dependencies, workspace/project/list CRUD, etc.) hits
  // this exact path when attempted offline, so a single check here gives all of
  // them a clear "you're offline" message for free, instead of a generic one.
  if (!navigator.onLine) return "You're offline — this needs a connection.";
  return fallback;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = fetchWithFallback('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        tokenStore.set(data.accessToken, data.refreshToken);
        return data.accessToken as string;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  isForm?: boolean;
  skipAuth?: boolean;
  headers?: Record<string, string>;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };
  if (!options.isForm) headers['Content-Type'] = 'application/json';
  if (!options.skipAuth && tokenStore.access) {
    headers.Authorization = `Bearer ${tokenStore.access}`;
  }

  const res = await fetchWithFallback(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.isForm ? (options.body as FormData) : options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options.skipAuth && !isRetry) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      return request<T>(path, options, true);
    }
    tokenStore.clear();
    window.location.assign('/login');
    throw new ApiError(401, 'Session expired');
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? res.statusText, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: Partial<RequestOptions>) => request<T>(path, opts),
  post: <T>(path: string, body?: unknown, opts?: Partial<RequestOptions>) =>
    request<T>(path, { method: 'POST', body, ...opts }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData, isForm: true }),
};
