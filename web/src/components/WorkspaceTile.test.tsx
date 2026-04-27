import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceTile } from './WorkspaceTile';
import type { WorkspaceConfig } from '@spectra/shared';

const workspace: WorkspaceConfig = {
  id: 'ws1',
  displayName: 'AP Invoices',
  template: 'invoices',
  containerId: 'c1',
  folderConvention: [],
  metadataSchema: [],
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdByOid: 'u1',
};

describe('WorkspaceTile', () => {
  it('renders a link when user has access', () => {
    render(
      <MemoryRouter>
        <WorkspaceTile workspace={workspace} hasAccess={true} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link')).toBeInTheDocument();
    expect(screen.getByText('AP Invoices')).toBeInTheDocument();
  });

  it('renders without a link when user does not have access', () => {
    render(
      <MemoryRouter>
        <WorkspaceTile workspace={workspace} hasAccess={false} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // The template badge should still be present
    expect(screen.getByText('invoices')).toBeInTheDocument();
  });

  it('shows Archived badge when workspace is archived', () => {
    render(
      <MemoryRouter>
        <WorkspaceTile workspace={{ ...workspace, archived: true }} hasAccess={true} />
      </MemoryRouter>
    );
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });
});
