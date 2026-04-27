import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AuthProvider } from '../auth/AuthContext';
import { WorkspacePickerPage } from './WorkspacePickerPage';

describe('WorkspacePickerPage', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/me')) return Promise.resolve(
        new Response(JSON.stringify({
          oid: 'u', tenantId: 't', displayName: 'Ada', upn: 'a@x', isAdmin: false,
          teamMemberships: [{ workspaceId: 'ap-invoices', teamCode: 'AP', teamDisplayName: 'AP' }],
        }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      if (url.includes('/workspaces')) return Promise.resolve(
        new Response(JSON.stringify([
          { id: 'ap-invoices', displayName: 'AP Invoices', template: 'invoices', containerId: 'c1', folderConvention: ['Team', 'Year', 'Month'], metadataSchema: [], archived: false, createdAt: '2026-01-01T00:00:00.000Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
          { id: 'contracts', displayName: 'Contracts', template: 'contracts', containerId: 'c2', folderConvention: ['Year'], metadataSchema: [], archived: false, createdAt: '2026-01-01T00:00:00.000Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
        ]), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('renders accessible tiles, dimming workspaces the user does not belong to', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <FluentProvider theme={webLightTheme}>
            <MemoryRouter><WorkspacePickerPage /></MemoryRouter>
          </FluentProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeInTheDocument());
    expect(await screen.findByRole('link', { name: /open ap invoices/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /do not have access/i })).toHaveAttribute('aria-disabled');
  });
});
