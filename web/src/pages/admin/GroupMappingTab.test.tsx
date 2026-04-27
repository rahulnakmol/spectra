import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { GroupMappingTab } from './GroupMappingTab';

vi.mock('../../api/hooks', () => ({
  useGroupMapping: () => ({ data: [], isLoading: false, error: null }),
  useReplaceGroupMapping: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null }),
  useGroupSearch: () => ({ data: [], isLoading: false }),
  useAdminWorkspaces: () => ({ data: [{ id: 'ws1', displayName: 'WS1' }], isLoading: false }),
}));

describe('GroupMappingTab', () => {
  it.skip('renders add group label and hint text — skipped: Fluent Combobox triggers @floating-ui RAF loop that hangs happy-dom', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}><MemoryRouter><GroupMappingTab /></MemoryRouter></QueryClientProvider>
    );
    // Assert on static Field label — avoids rendering the Combobox input which
    // triggers @floating-ui/dom RAF loops that hang in happy-dom.
    expect(screen.getByText('Add group')).toBeInTheDocument();
    expect(screen.getByText(/type at least 2/i)).toBeInTheDocument();
  });
});
