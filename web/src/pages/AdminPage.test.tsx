import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminPage } from './AdminPage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({ user: { oid: 'u1', isAdmin: true }, isLoading: false }),
}));
vi.mock('../api/hooks', () => ({
  useAdminWorkspaces: () => ({ data: [], isLoading: false, error: null }),
  useCreateWorkspace: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUpdateWorkspace: () => ({ mutate: vi.fn(), isPending: false }),
  useGroupMapping: () => ({ data: [], isLoading: false, error: null }),
  useReplaceGroupMapping: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null }),
  useGroupSearch: () => ({ data: [], isLoading: false }),
  useAudit: () => ({ data: [], isLoading: false, error: null }),
}));

describe('AdminPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders heading and tab list', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/w/ap-invoices/admin/workspaces']}>
          <Routes>
            <Route path="/w/:ws/admin/*" element={<AdminPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByRole('heading', { name: /admin/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /workspaces/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /group mapping/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /audit/i })).toBeInTheDocument();
  });
});
