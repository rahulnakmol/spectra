import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';

const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'new-ws' });

vi.mock('../../api/hooks', () => ({
  useCreateWorkspace: () => ({ mutateAsync: mockMutateAsync, isPending: false, isError: false, error: null }),
}));

describe('CreateWorkspaceDialog', () => {
  it('renders dialog when open', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <CreateWorkspaceDialog open={true} onClose={vi.fn()} />
      </QueryClientProvider>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/id \(lowercase-kebab\)/i)).toBeInTheDocument();
  });

  it('does not render dialog content when closed', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <CreateWorkspaceDialog open={false} onClose={vi.fn()} />
      </QueryClientProvider>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <CreateWorkspaceDialog open={true} onClose={onClose} />
      </QueryClientProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows validation error for invalid JSON schema', async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <CreateWorkspaceDialog open={true} onClose={vi.fn()} />
      </QueryClientProvider>
    );
    // Clear default schema and type invalid JSON
    const textarea = screen.getByRole('textbox', { name: /metadata schema/i });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'not-json');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByText(/unexpected token/i)).toBeInTheDocument();
  });

  it('shows validation error when schema is not an array', async () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <CreateWorkspaceDialog open={true} onClose={vi.fn()} />
      </QueryClientProvider>
    );
    const textarea = screen.getByRole('textbox', { name: /metadata schema/i });
    fireEvent.change(textarea, { target: { value: '{"key":"val"}' } });
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByText(/must be a JSON array/i)).toBeInTheDocument();
  });
});
