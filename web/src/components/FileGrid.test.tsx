import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FileGrid } from './FileGrid';

const sample = [
  { id: '1', name: 'b.pdf', folderPath: '', uploadedByOid: 'u', uploadedByDisplayName: 'Ada', uploadedAt: '2026-04-01T00:00:00Z', sizeBytes: 100, metadata: {} },
  { id: '2', name: 'a.pdf', folderPath: '', uploadedByOid: 'u', uploadedByDisplayName: 'Ada', uploadedAt: '2026-04-02T00:00:00Z', sizeBytes: 2048, metadata: {} },
];

describe('FileGrid', () => {
  it('renders rows and emits selection on click', async () => {
    const onSelect = vi.fn();
    render(
      <FluentProvider theme={webLightTheme}>
        <FileGrid files={sample} onSelect={onSelect} />
      </FluentProvider>,
    );
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByText('a.pdf'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
  });

  it('shows hidden-by-policy badge', () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <FileGrid files={sample} onSelect={() => undefined} hiddenByPolicy={3} />
      </FluentProvider>,
    );
    expect(screen.getByText(/3 files hidden by only-own policy/i)).toBeInTheDocument();
  });
});
