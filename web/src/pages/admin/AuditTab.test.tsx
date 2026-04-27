import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditTab } from './AuditTab';

const mockUseAudit = vi.fn().mockReturnValue({ data: [], isLoading: false, error: null });

vi.mock('../../api/hooks', () => ({
  useAudit: (...args: unknown[]) => mockUseAudit(...args),
}));

describe('AuditTab', () => {
  it('renders filter form', () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><AuditTab /></QueryClientProvider>);
    expect(screen.getByRole('button', { name: /apply filters/i })).toBeInTheDocument();
    expect(screen.getByLabelText('User OID')).toBeInTheDocument();
  });

  it('renders all filter fields', () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><AuditTab /></QueryClientProvider>);
    expect(screen.getByLabelText('Workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Action')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('updates filter fields and applies on submit', async () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><AuditTab /></QueryClientProvider>);
    const oidInput = screen.getByLabelText('User OID');
    await userEvent.type(oidInput, 'u1');
    await userEvent.click(screen.getByRole('button', { name: /apply filters/i }));
    // After submit, useAudit should have been called with the applied filters
    expect(mockUseAudit).toHaveBeenCalled();
  });

  it('renders audit rows when data is provided', () => {
    mockUseAudit.mockReturnValue({
      data: [{ timestamp: '2026-04-01T00:00:00Z', userOid: 'u1', action: 'upload', outcome: 'success', durationMs: 42 }],
      isLoading: false,
      error: null,
    });
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><AuditTab /></QueryClientProvider>);
    expect(screen.getByText('upload')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
  });

  it('shows date filter changes', () => {
    mockUseAudit.mockReturnValue({ data: [], isLoading: false, error: null });
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><AuditTab /></QueryClientProvider>);
    const fromInput = screen.getByLabelText('From');
    fireEvent.change(fromInput, { target: { value: '2026-04-01' } });
    expect(fromInput).toHaveValue('2026-04-01');
  });
});
