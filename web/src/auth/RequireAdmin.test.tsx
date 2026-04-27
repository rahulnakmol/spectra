import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RequireAdmin } from './RequireAdmin';

vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}));
import { useAuth } from './AuthContext';

describe('RequireAdmin', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders children for admin user', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { oid: 'u1', tenantId: 't', displayName: 'Ada', upn: 'a@x', isAdmin: true, teamMemberships: [] },
      isLoading: false,
    } as ReturnType<typeof useAuth>);
    render(<MemoryRouter><RequireAdmin><p>admin only</p></RequireAdmin></MemoryRouter>);
    expect(screen.getByText('admin only')).toBeInTheDocument();
  });

  it('redirects non-admin to /w', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { oid: 'u1', tenantId: 't', displayName: 'Ada', upn: 'a@x', isAdmin: false, teamMemberships: [] },
      isLoading: false,
    } as ReturnType<typeof useAuth>);
    render(
      <MemoryRouter initialEntries={['/w/ws1/admin']}>
        <RequireAdmin><p>admin only</p></RequireAdmin>
      </MemoryRouter>
    );
    expect(screen.queryByText('admin only')).not.toBeInTheDocument();
  });
});
