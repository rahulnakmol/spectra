import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AgentFlyoutLauncher } from './AgentFlyoutLauncher';

describe('AgentFlyoutLauncher', () => {
  it('opens and closes via Escape', async () => {
    render(<FluentProvider theme={webLightTheme}><AgentFlyoutLauncher /></FluentProvider>);
    const launcher = screen.getByRole('button', { name: /open assistant/i });
    await userEvent.click(launcher);
    expect(await screen.findByText(/coming soon/i)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
  });
});
