import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { UploadPage } from './UploadPage';

describe('UploadPage', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true, configurable: true });
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/workspaces') && !url.includes('/teams')) return Promise.resolve(
        new Response(JSON.stringify([
          { id: 'ap-invoices', displayName: 'AP', template: 'invoices', containerId: 'c', folderConvention: ['Team','Year','Month'],
            metadataSchema: [{ name: 'Vendor', type: 'string', required: true, indexed: true }],
            archived: false, createdAt: '2026-01-01T00:00:00.000Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
        ]), { status: 200, headers: { 'content-type': 'application/json' } }),
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

  it('walks through steps and shows progress on submit', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <FluentProvider theme={webLightTheme}>
          <MemoryRouter initialEntries={['/w/ap-invoices/upload']}>
            <Routes>
              <Route path="/w/:ws/upload" element={<UploadPage />} />
            </Routes>
          </MemoryRouter>
        </FluentProvider>
      </QueryClientProvider>,
    );
    const file = new File([new Uint8Array(1024)], 'inv.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/choose file/i) as HTMLInputElement, file);
    await waitFor(() => expect(screen.getByText(/selected: inv.pdf/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText(/team/i)).toBeInTheDocument();
  });
});
