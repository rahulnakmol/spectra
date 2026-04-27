import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ShareDialog } from './ShareDialog';

const file = {
  id: 'f1', name: 'inv.pdf', folderPath: '', uploadedByOid: 'u',
  uploadedByDisplayName: 'Ada', uploadedAt: '2026-01-01T00:00:00Z', sizeBytes: 1, metadata: {},
};

describe('ShareDialog', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
    );
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('shows the locked Prevent download badge and validates empty recipients', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <FluentProvider theme={webLightTheme}>
          <ShareDialog file={file} open onClose={() => undefined} />
        </FluentProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText(/prevent download is locked on/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^share$/i }));
    expect(await screen.findByText(/at least one recipient is required/i)).toBeInTheDocument();
  });
});
