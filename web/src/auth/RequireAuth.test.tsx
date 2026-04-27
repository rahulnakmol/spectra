import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}));
import { useAuth } from './AuthContext';

describe('RequireAuth', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows spinner while loading', () => {
    vi.mocked(useAuth).mockReturnValue({ user: undefined, isLoading: true } as ReturnType<typeof useAuth>);
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}><MemoryRouter>
        <RequireAuth><p>protected</p></RequireAuth>
      </MemoryRouter></QueryClientProvider>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { oid: 'u1', tenantId: 't', displayName: 'Ada', upn: 'a@x', isAdmin: false, teamMemberships: [] },
      isLoading: false,
    } as ReturnType<typeof useAuth>);
    const qc = new QueryClient();
    Object.defineProperty(window, 'location', { value: { href: '/' }, writable: true });
    render(
      <QueryClientProvider client={qc}><MemoryRouter>
        <RequireAuth><p>protected</p></RequireAuth>
      </MemoryRouter></QueryClientProvider>
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
  });

  it('redirects when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: undefined, isLoading: false } as ReturnType<typeof useAuth>);
    const href = { value: '/' };
    Object.defineProperty(window, 'location', {
      value: {
        get href() { return href.value; },
        set href(v) { href.value = v; },
      },
      writable: true,
    });
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}><MemoryRouter>
        <RequireAuth><p>protected</p></RequireAuth>
      </MemoryRouter></QueryClientProvider>
    );
    expect(href.value).toBe('/api/auth/login');
  });
});
