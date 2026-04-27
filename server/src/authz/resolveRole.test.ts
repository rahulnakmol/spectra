import { describe, it, expect, jest } from '@jest/globals';
import { resolveRoleSnapshot } from './resolveRole.js';
import type { IdTokenClaims } from '../auth/msal.js';
import type { ConfigStore } from '../store/configStore.js';

function makeStore(entries: Array<{ entraGroupId: string; entraGroupDisplayName: string; workspaceId: string; teamCode: string; teamDisplayName: string }>): ConfigStore {
  return {
    getWorkspaces: jest.fn(),
    getGroupRoleMap: jest.fn(async () => ({ entries })),
    getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(),
    putGroupRoleMap: jest.fn(),
    putAppSettings: jest.fn(),
    invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

const groupId = '11111111-1111-1111-1111-111111111111';

describe('resolveRoleSnapshot', () => {
  it('flags AppAdmin role from claim', async () => {
    const store = makeStore([]);
    const claims: IdTokenClaims = { oid: 'O', tid: 'T', preferred_username: 'u', name: 'n', roles: ['AppAdmin'] };
    const out = await resolveRoleSnapshot(claims, 'AT', { store, fetchGroupsOverage: jest.fn<() => Promise<string[]>>() });
    expect(out.isAdmin).toBe(true);
  });

  it('intersects token group claims with group-role-map', async () => {
    const store = makeStore([
      { entraGroupId: groupId, entraGroupDisplayName: 'Finance', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
    ]);
    const claims: IdTokenClaims = { oid: 'O', tid: 'T', preferred_username: 'u', name: 'n', groups: [groupId] };
    const out = await resolveRoleSnapshot(claims, 'AT', { store, fetchGroupsOverage: jest.fn<() => Promise<string[]>>() });
    expect(out.isAdmin).toBe(false);
    expect(out.teamMemberships).toEqual([{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' }]);
  });

  it('falls back to /me/transitiveMemberOf on groups overage', async () => {
    const store = makeStore([
      { entraGroupId: groupId, entraGroupDisplayName: 'Finance', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
    ]);
    const claims: IdTokenClaims = { oid: 'O', tid: 'T', preferred_username: 'u', name: 'n', _claim_names: { groups: 'src1' } };
    const fetchGroupsOverage = jest.fn(async () => [groupId]);
    const out = await resolveRoleSnapshot(claims, 'AT', { store, fetchGroupsOverage });
    expect(fetchGroupsOverage).toHaveBeenCalledWith('AT');
    expect(out.teamMemberships).toHaveLength(1);
  });

  it('returns empty memberships when no overlap', async () => {
    const store = makeStore([
      { entraGroupId: groupId, entraGroupDisplayName: 'Finance', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
    ]);
    const claims: IdTokenClaims = { oid: 'O', tid: 'T', preferred_username: 'u', name: 'n', groups: ['other-id'] };
    const out = await resolveRoleSnapshot(claims, 'AT', { store, fetchGroupsOverage: jest.fn<() => Promise<string[]>>() });
    expect(out.teamMemberships).toHaveLength(0);
  });

  it('deduplicates when two groups map to the same workspace+team', async () => {
    const groupId2 = '22222222-2222-2222-2222-222222222222';
    const store = makeStore([
      { entraGroupId: groupId, entraGroupDisplayName: 'Finance', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
      { entraGroupId: groupId2, entraGroupDisplayName: 'Finance-Sub', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
    ]);
    const claims: IdTokenClaims = { oid: 'O', tid: 'T', preferred_username: 'u', name: 'n', groups: [groupId, groupId2] };
    const out = await resolveRoleSnapshot(claims, 'AT', { store, fetchGroupsOverage: jest.fn<() => Promise<string[]>>() });
    expect(out.teamMemberships).toHaveLength(1);
  });
});
