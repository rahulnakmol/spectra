import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  const originalFetch = global.fetch;

  // happy-dom localStorage stub
  const store: Record<string, string> = {};
  const localStorageMock: Storage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => { delete store[k]; }); },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };

  beforeEach(() => {
    Object.keys(store).forEach(k => { delete store[k]; });
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true, configurable: true });
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost', href: '/' }, writable: true });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('toggles between light and dark and persists', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ brandName: 'S', welcomePitch: '', defaultTheme: 'light' }),
        { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider><ThemeToggle /></ThemeProvider>
      </QueryClientProvider>,
    );
    const btn = screen.getByRole('button', { name: /switch to dark theme/i });
    await userEvent.click(btn);
    expect(localStorageMock.getItem('spectra.theme')).toBe('dark');
  });
});
