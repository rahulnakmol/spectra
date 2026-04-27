import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { WorkspacesTab } from './WorkspacesTab';

describe('WorkspacesTab', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true, configurable: true });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        { id: 'inv', displayName: 'Invoices', template: 'invoices', containerId: 'c', folderConvention: ['x'], metadataSchema: [], archived: false, createdAt: '2026-01-01T00:00:00.000Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
      ]), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('lists workspaces with archive switches', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <FluentProvider theme={webLightTheme}><WorkspacesTab /></FluentProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Invoices')).toBeInTheDocument());
    expect(screen.getByLabelText(/archive invoices/i)).toBeInTheDocument();
  });
});
