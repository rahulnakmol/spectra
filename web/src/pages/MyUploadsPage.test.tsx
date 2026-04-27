import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MyUploadsPage } from './MyUploadsPage';

vi.mock('../api/hooks', () => ({
  useFiles: vi.fn().mockReturnValue({ data: [], isLoading: false, error: null }),
  useFilePreview: vi.fn().mockReturnValue({ data: undefined, isLoading: false }),
}));

import { useFiles } from '../api/hooks';

describe('MyUploadsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  function renderPage() {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/w/ap-invoices/my']}>
          <Routes>
            <Route path="/w/:ws/my" element={<MyUploadsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('renders heading', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /my uploads/i })).toBeInTheDocument();
  });

  it('shows spinner while loading', () => {
    vi.mocked(useFiles).mockReturnValue({ data: undefined, isLoading: true, error: null } as ReturnType<typeof useFiles>);
    renderPage();
    // Fluent UI Spinner renders with aria-label text
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows error message on failure', () => {
    vi.mocked(useFiles).mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail') } as ReturnType<typeof useFiles>);
    renderPage();
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });
});
