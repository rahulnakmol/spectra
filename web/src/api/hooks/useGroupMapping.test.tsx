import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGroupMapping, useReplaceGroupMapping, useGroupSearch } from './useGroupMapping';

describe('useGroupMapping', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('fetches group mapping entries', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{
        entraGroupId: 'g1',
        entraGroupDisplayName: 'AP Group',
        workspaceId: 'ws1',
        teamCode: 'AP',
        teamDisplayName: 'AP Team',
      }]), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useGroupMapping(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.teamCode).toBe('AP');
  });
});

describe('useReplaceGroupMapping', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('replaces group mapping', async () => {
    const entries = [{
      entraGroupId: 'g1',
      entraGroupDisplayName: 'AP Group',
      workspaceId: 'ws1',
      teamCode: 'AP',
      teamDisplayName: 'AP Team',
    }];
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(entries), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useReplaceGroupMapping(), { wrapper });
    act(() => { result.current.mutate(entries); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.entraGroupId).toBe('g1');
  });
});

describe('useGroupSearch', () => {
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
    const { result } = renderHook(() => useGroupSearch('a'), { wrapper });
    expect(result.current.isFetching).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches group search results when query >= 2 chars', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'g1', displayName: 'AP Group' }]), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useGroupSearch('AP'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.id).toBe('g1');
  });
});
