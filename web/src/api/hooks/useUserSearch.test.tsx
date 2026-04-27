import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserSearch } from './useUserSearch';

describe('useUserSearch', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('is disabled when query is less than 2 chars', () => {
    global.fetch = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUserSearch('a'), { wrapper });
    expect(result.current.isFetching).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches users when query >= 2 chars', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ oid: 'u1', displayName: 'Ada', upn: 'ada@x' }]), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUserSearch('Ad'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.oid).toBe('u1');
  });
});
