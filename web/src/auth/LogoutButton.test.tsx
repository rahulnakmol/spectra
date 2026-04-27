import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { LogoutButton } from './LogoutButton';

describe('LogoutButton', () => {
  it('posts to /api/auth/logout', () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <LogoutButton />
      </FluentProvider>,
    );
    const btn = screen.getByRole('button', { name: /sign out/i });
    expect(btn.closest('form')?.getAttribute('action')).toBe('/api/auth/logout');
    expect(btn.closest('form')?.getAttribute('method')?.toLowerCase()).toBe('post');
  });
});
