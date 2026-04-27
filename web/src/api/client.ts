import { ApiError, type ApiErrorBody } from './errors';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  formData?: FormData;
}

const API_BASE = '/api';

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    // non-JSON body — fall through
  }
  const code = body.error?.code ?? `HTTP_${res.status}`;
  const message = body.error?.message ?? res.statusText;
  return new ApiError(res.status, code, message, body.error?.details);
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    credentials: 'same-origin',
    headers: opts.formData ? {} : { 'Content-Type': 'application/json' },
    signal: opts.signal ?? null,
  };
  if (opts.formData) {
    init.body = opts.formData;
  } else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(buildUrl(path, opts.query), init);
  if (res.status === 401) {
    window.location.href = `${API_BASE}/auth/login`;
    throw new ApiError(401, 'UNAUTHENTICATED', 'Redirecting to sign in');
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
