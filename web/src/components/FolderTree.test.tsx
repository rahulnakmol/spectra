import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FolderTree } from './FolderTree';

describe('FolderTree', () => {
  it('emits selection on team / year / month clicks', async () => {
    const onSelect = vi.fn();
    render(
      <FluentProvider theme={webLightTheme}>
        <FolderTree
          teams={[{ workspaceId: 'ws', teamCode: 'AP', teamDisplayName: 'Accounts Payable' }]}
          selection={{}}
          onSelect={onSelect}
        />
      </FluentProvider>,
    );
    await userEvent.click(screen.getByText('Accounts Payable'));
    expect(onSelect).toHaveBeenCalledWith({ team: 'AP' });
  });
});
