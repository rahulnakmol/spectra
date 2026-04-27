import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request } from './client';
import { ApiError } from './errors';

describe('api client', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost', href: 'http://localhost/' },
      writable: true,
    });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on 200', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const r = await request<{ ok: boolean }>('/files');
    expect(r.ok).toBe(true);
  });

  it('throws ApiError on 4xx with structured body', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'gone' } }), { status: 404 }),
    );
    await expect(request('/files/x')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('redirects to login on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    await expect(request('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(window.location.href).toBe('/api/auth/login');
  });

  it('serializes query params', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = fetchSpy;
    await request('/files', { query: { ws: 'inv', team: 'AP', year: 2026 } });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/files?ws=inv&team=AP&year=2026',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
