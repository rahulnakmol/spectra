import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthContext';

function Probe() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p>loading</p>;
  return <p>{user?.displayName ?? 'anon'}</p>;
}

describe('AuthProvider', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('exposes the authenticated user', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        oid: 'u', tenantId: 't', displayName: 'Ada', upn: 'a@x', isAdmin: true, teamMemberships: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider><Probe /></AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
  });
});
