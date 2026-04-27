import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useShare } from './useShare';

describe('useShare', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('sends share request', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ link: 'https://x.com/share' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useShare(), { wrapper });
    act(() => {
      result.current.mutate({ itemId: 'f1', recipients: [{ oid: 'u2', displayName: 'Bob', upn: 'bob@x' }], expiresAt: '2026-05-01T00:00:00Z', preventDownload: true });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.link).toBe('https://x.com/share');
  });
});
