import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearch } from './useSearch';

describe('useSearch', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('is disabled when query is too short', () => {
    global.fetch = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSearch('ws1', 'a'), { wrapper });
    expect(result.current.isFetching).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('is disabled when workspace is undefined', () => {
    global.fetch = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSearch(undefined, 'invoice'), { wrapper });
    expect(result.current.isFetching).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches results when workspace and query are valid', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{
        id: 'f1', name: 'invoice.pdf', folderPath: '/AP/2026/04',
        uploadedByOid: 'u1', uploadedByDisplayName: 'Ada',
        uploadedAt: '2026-04-01T00:00:00Z', sizeBytes: 1024, metadata: {},
      }]), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSearch('ws1', 'invoice'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.id).toBe('f1');
  });
});
