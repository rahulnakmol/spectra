import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WorkspaceLandingPage } from './WorkspaceLandingPage';

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));
import { useAuth } from '../auth/AuthContext';

describe('WorkspaceLandingPage', () => {
  afterEach(() => vi.restoreAllMocks());

  function renderPage(isAdmin: boolean) {
    vi.mocked(useAuth).mockReturnValue({
      user: { oid: 'u1', tenantId: 't', displayName: 'Ada', upn: 'a@x', isAdmin, teamMemberships: [] },
      isLoading: false,
    } as ReturnType<typeof useAuth>);
    render(
      <MemoryRouter initialEntries={['/w/ap-invoices']}>
        <Routes>
          <Route path="/w/:ws" element={<WorkspaceLandingPage />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('shows standard tiles for non-admin', () => {
    renderPage(false);
    expect(screen.getByText('Browse files')).toBeInTheDocument();
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByText('My uploads')).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows Admin tile for admin user', () => {
    renderPage(true);
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });
});
