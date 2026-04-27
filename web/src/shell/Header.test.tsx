import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Header } from './Header';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { oid: 'u1', displayName: 'Ada', isAdmin: false, teamMemberships: [] },
    isLoading: false,
  }),
}));
vi.mock('../api/hooks', () => ({
  useAppSettings: vi.fn().mockReturnValue({ data: { brandName: 'Spectra' }, isLoading: false }),
}));
vi.mock('../auth/LogoutButton', () => ({
  LogoutButton: () => <button>Log out</button>,
}));
vi.mock('../theme/ThemeToggle', () => ({
  ThemeToggle: () => <button aria-label="Switch to dark theme">theme</button>,
}));

describe('Header', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders brand name and user avatar', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText('Spectra')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
