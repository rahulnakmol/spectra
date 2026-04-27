import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PreviewPane } from './PreviewPane';

const file = {
  id: 'f1', name: 'inv.pdf', folderPath: '', uploadedByOid: 'u',
  uploadedByDisplayName: 'Ada', uploadedAt: '2026-04-01T00:00:00Z',
  sizeBytes: 1024, metadata: { Vendor: 'Acme', Amount: 500 },
};

describe('PreviewPane', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true, configurable: true });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: 'https://contoso.sharepoint.com/preview/abc' }),
        { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders iframe with preview URL and metadata', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <FluentProvider theme={webLightTheme}>
          <PreviewPane file={file} />
        </FluentProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTitle(/preview of inv.pdf/i)).toBeInTheDocument());
    expect(screen.getByText('Vendor')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });
});
