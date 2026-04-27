import { describe, it, expect, jest } from '@jest/globals';
import { resolveWorkspaceContext } from './workspaceContext.js';
import type { ConfigStore } from '../store/configStore.js';

function makeStore(workspaces: Array<{ id: string; archived?: boolean }>): ConfigStore {
  return {
    getWorkspaces: jest.fn(async () => ({ workspaces: workspaces.map((w) => ({
      id: w.id, displayName: w.id, template: 'invoices' as const, containerId: `C-${w.id}`,
      folderConvention: ['Team', 'YYYY', 'MM'], metadataSchema: [], archived: !!w.archived,
      createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000',
    })) })),
    getGroupRoleMap: jest.fn(),
    getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(),
    putGroupRoleMap: jest.fn(),
    putAppSettings: jest.fn(),
    invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

describe('resolveWorkspaceContext', () => {
  it('returns workspace + driveId', async () => {
    const ws = await resolveWorkspaceContext(makeStore([{ id: 'invoices' }]), 'invoices');
    expect(ws.driveId).toBe('C-invoices');
  });
  it('throws NotFoundError for unknown workspace', async () => {
    await expect(resolveWorkspaceContext(makeStore([]), 'missing')).rejects.toMatchObject({ code: 'not_found' });
  });
  it('throws NotFoundError for archived workspace', async () => {
    await expect(resolveWorkspaceContext(makeStore([{ id: 'invoices', archived: true }]), 'invoices')).rejects.toMatchObject({ code: 'not_found' });
  });
});
