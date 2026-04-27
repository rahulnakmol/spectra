import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAdminWorkspaces, useCreateWorkspace, useUpdateWorkspace } from './useAdminWorkspaces';

describe('useAdminWorkspaces', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('fetches admin workspaces', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{
        id: 'ws1',
        displayName: 'WS1',
        template: 'invoices',
        containerId: 'c1',
        folderConvention: [],
        metadataSchema: [],
        archived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        createdByOid: 'u1',
      }]), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAdminWorkspaces(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.id).toBe('ws1');
  });
});

describe('useCreateWorkspace', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('creates a workspace', async () => {
    const created = {
      id: 'new-ws',
      displayName: 'New WS',
      template: 'invoices',
      containerId: 'c2',
      folderConvention: [],
      metadataSchema: [],
      archived: false,
      createdAt: '2026-04-01T00:00:00.000Z',
      createdByOid: 'u1',
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(created), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateWorkspace(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'new-ws', displayName: 'New WS', template: 'invoices' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('new-ws');
  });
});

describe('useUpdateWorkspace', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('updates a workspace', async () => {
    const updated = {
      id: 'ws1',
      displayName: 'Updated WS',
      template: 'invoices',
      containerId: 'c1',
      folderConvention: [],
      metadataSchema: [],
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdByOid: 'u1',
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(updated), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateWorkspace(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'ws1', patch: { displayName: 'Updated WS' } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.displayName).toBe('Updated WS');
  });
});
