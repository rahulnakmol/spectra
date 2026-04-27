import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DropZone } from './DropZone';

describe('DropZone', () => {
  it('exposes a keyboard-reachable Browse button', () => {
    render(<FluentProvider theme={webLightTheme}><DropZone onFile={() => undefined} /></FluentProvider>);
    expect(screen.getByRole('button', { name: /browse files/i })).toBeInTheDocument();
  });

  it('rejects an oversized file with an aria-live message', async () => {
    const onFile = vi.fn();
    render(<FluentProvider theme={webLightTheme}><DropZone onFile={onFile} /></FluentProvider>);
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    const arr = new ArrayBuffer(26 * 1024 * 1024);
    const big = new File([arr], 'big.pdf', { type: 'application/pdf' });
    await userEvent.upload(input, big);
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/exceeds 25 MB cap/i)).toBeInTheDocument();
  });

  it('rejects a forbidden extension', async () => {
    const onFile = vi.fn();
    render(<FluentProvider theme={webLightTheme}><DropZone onFile={onFile} /></FluentProvider>);
    const input = screen.getByLabelText(/choose file/i) as HTMLInputElement;
    const exe = new File(['x'], 'malware.exe', { type: 'application/octet-stream' });
    // applyAccept:false bypasses userEvent's built-in accept filtering so our
    // component's own validation logic is exercised instead.
    await userEvent.setup({ applyAccept: false }).upload(input, exe);
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/\.exe is not allowed/i)).toBeInTheDocument();
  });
});
