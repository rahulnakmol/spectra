import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthContext';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AppShell } from './AppShell';

describe('AppShell', () => {
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
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/me')) return Promise.resolve(
        new Response(JSON.stringify({ oid: 'u', tenantId: 't', displayName: 'Ada', upn: 'a@x', isAdmin: false, teamMemberships: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } }),
      );
      return Promise.resolve(
        new Response(JSON.stringify({ brandName: 'Spectra', welcomePitch: 'p', defaultTheme: 'light' }),
          { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    });
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('renders header with brand and main landmark', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <ThemeProvider>
            <MemoryRouter initialEntries={['/w']}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route path="/w" element={<p>tile grid</p>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole('banner')).toBeInTheDocument());
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('tile grid')).toBeInTheDocument();
  });
});
