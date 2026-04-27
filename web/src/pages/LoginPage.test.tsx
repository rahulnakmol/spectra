import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('renders brand and sign-in form posting to /api/auth/login', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ brandName: 'Acme Vault', welcomePitch: 'p', defaultTheme: 'light' }),
        { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <FluentProvider theme={webLightTheme}>
          <LoginPage />
        </FluentProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Acme Vault' })).toBeInTheDocument());
    const button = screen.getByRole('button', { name: /sign in with microsoft/i });
    expect(button).toBeInTheDocument();
    expect(button.closest('form')?.getAttribute('action')).toBe('/api/auth/login');
  });
});
