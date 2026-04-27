import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMe } from './useMe';

describe('useMe', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });

  it('returns the user identity', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        oid: 'u1', tenantId: 't', displayName: 'Ada', upn: 'ada@x', isAdmin: false, teamMemberships: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.displayName).toBe('Ada');
  });
});
