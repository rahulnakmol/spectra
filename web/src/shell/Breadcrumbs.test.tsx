import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Breadcrumbs } from './Breadcrumbs';

function renderAt(path: string, routePattern = '*') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePattern} element={<Breadcrumbs />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Breadcrumbs', () => {
  it('returns null on login page', () => {
    renderAt('/login');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('returns null on root path', () => {
    renderAt('/');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows Workspaces and workspace name on workspace route', () => {
    render(
      <MemoryRouter initialEntries={['/w/ap-invoices']}>
        <Routes>
          <Route path="/w/:ws" element={<Breadcrumbs />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Workspaces')).toBeInTheDocument();
    expect(screen.getByText('ap-invoices')).toBeInTheDocument();
  });

  it('shows Browse segment on browse route', () => {
    render(
      <MemoryRouter initialEntries={['/w/ap-invoices/browse']}>
        <Routes>
          <Route path="/w/:ws/browse" element={<Breadcrumbs />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Browse')).toBeInTheDocument();
  });

  it('shows Upload segment on upload route', () => {
    render(
      <MemoryRouter initialEntries={['/w/ap-invoices/upload']}>
        <Routes>
          <Route path="/w/:ws/upload" element={<Breadcrumbs />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });

  it('shows My uploads segment on my route', () => {
    render(
      <MemoryRouter initialEntries={['/w/ap-invoices/my']}>
        <Routes>
          <Route path="/w/:ws/my" element={<Breadcrumbs />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('My uploads')).toBeInTheDocument();
  });
});
