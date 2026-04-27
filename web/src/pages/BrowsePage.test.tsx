import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AuthProvider } from '../auth/AuthContext';
import { BrowsePage } from './BrowsePage';

describe('BrowsePage', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true, configurable: true });
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/me')) return Promise.resolve(
        new Response(JSON.stringify({ oid: 'u', tenantId: 't', displayName: 'Ada', upn: 'a@x', isAdmin: false, teamMemberships: [{ workspaceId: 'ap-invoices', teamCode: 'AP', teamDisplayName: 'AP' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      if (url.includes('/teams')) return Promise.resolve(
        new Response(JSON.stringify([{ workspaceId: 'ap-invoices', teamCode: 'AP', teamDisplayName: 'AP' }]),
          { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders three-pane layout with folder tree', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <FluentProvider theme={webLightTheme}>
            <MemoryRouter initialEntries={['/w/ap-invoices/browse']}>
              <Routes>
                <Route path="/w/:ws/browse" element={<BrowsePage />} />
              </Routes>
            </MemoryRouter>
          </FluentProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Folders' })).toBeInTheDocument());
    expect(screen.getByText(/select a team folder/i)).toBeInTheDocument();
  });
});
