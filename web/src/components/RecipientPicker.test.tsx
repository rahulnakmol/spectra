import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { RecipientPicker, type Recipient } from './RecipientPicker';
import { useState } from 'react';

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(ui: React.ReactElement, qc = makeQc()) {
  return render(
    <QueryClientProvider client={qc}>
      <FluentProvider theme={webLightTheme}>{ui}</FluentProvider>
    </QueryClientProvider>,
  );
}

function Wrapper() {
  const [val, setVal] = useState<Recipient[]>([]);
  return <RecipientPicker value={val} onChange={setVal} />;
}

describe('RecipientPicker', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([{ oid: 'u1', displayName: 'Ada Lovelace', upn: 'ada@x.com' }]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  });
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it('renders existing recipients as dismissible chips', () => {
    const recipients: Recipient[] = [{ upn: 'ada@x.com', displayName: 'Ada Lovelace' }];
    wrap(<RecipientPicker value={recipients} onChange={() => undefined} />);
    expect(screen.getByLabelText(/remove ada lovelace/i)).toBeInTheDocument();
  });

  it('removes a chip when dismissed', async () => {
    const onChange = vi.fn();
    const recipients: Recipient[] = [{ upn: 'ada@x.com', displayName: 'Ada Lovelace' }];
    wrap(<RecipientPicker value={recipients} onChange={onChange} />);
    const dismiss = screen.getByLabelText(/remove ada lovelace/i);
    await userEvent.click(dismiss);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('calls the search API when 2+ characters are typed', async () => {
    wrap(<Wrapper />);
    const combobox = screen.getByRole('combobox');
    await userEvent.type(combobox, 'ad');
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/search'),
        expect.anything(),
      ),
    );
  });

  it('shows validation error when error prop is set', () => {
    wrap(<RecipientPicker value={[]} onChange={() => undefined} error="At least one recipient required" />);
    expect(screen.getByText(/at least one recipient required/i)).toBeInTheDocument();
  });
});
