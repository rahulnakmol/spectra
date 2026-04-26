import { describe, it, expect, jest } from '@jest/globals';
import { createConfigStore } from './configStore.js';

function fakeReader(payloads: Record<string, unknown>) {
  return jest.fn(async (path: string) => {
    if (!(path in payloads)) {
      const err = new Error('not found') as Error & { code: string };
      err.code = 'not_found';
      throw err;
    }
    return JSON.stringify(payloads[path]);
  });
}

describe('ConfigStore', () => {
  it('reads + parses workspaces.json against schema', async () => {
    const reader = fakeReader({
      '/config/workspaces.json': {
        workspaces: [{
          id: 'invoices', displayName: 'Invoices', template: 'invoices',
          containerId: 'C1', folderConvention: ['Team', 'YYYY', 'MM'],
          metadataSchema: [], archived: false,
          createdAt: '2026-04-26T00:00:00Z',
          createdByOid: '00000000-0000-0000-0000-000000000000',
        }],
      },
    });
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    const out = await store.getWorkspaces();
    expect(out.workspaces).toHaveLength(1);
    expect(out.workspaces[0]?.id).toBe('invoices');
  });

  it('caches subsequent reads within TTL', async () => {
    const reader = fakeReader({ '/config/workspaces.json': { workspaces: [] } });
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    await store.getWorkspaces();
    await store.getWorkspaces();
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('returns empty defaults when config files do not exist yet', async () => {
    const reader = fakeReader({});
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    expect((await store.getWorkspaces()).workspaces).toEqual([]);
    expect((await store.getGroupRoleMap()).entries).toEqual([]);
    expect((await store.getAppSettings()).brandName).toBe('Docs Vault');
  });

  it('rejects schema-invalid payloads', async () => {
    const reader = fakeReader({ '/config/workspaces.json': { workspaces: [{ id: 'BAD UPPER' }] } });
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    await expect(store.getWorkspaces()).rejects.toThrow(/lowercase-kebab|workspaces\[0\]/);
  });

  it('invalidate() forces re-read', async () => {
    const reader = fakeReader({ '/config/workspaces.json': { workspaces: [] } });
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    await store.getWorkspaces();
    store.invalidate();
    await store.getWorkspaces();
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it('propagates reader errors that are not not_found', async () => {
    const reader = jest.fn(async (_path: string) => {
      const err = new Error('network failure') as Error & { code: string };
      err.code = 'ECONNRESET';
      throw err;
    });
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    await expect(store.getWorkspaces()).rejects.toThrow('network failure');
  });

  it('falls back to defaults when file has status 404', async () => {
    const reader = jest.fn(async (_path: string) => {
      const err = new Error('not found') as Error & { status: number };
      err.status = 404;
      throw err;
    });
    const store = createConfigStore({ reader, ttlMs: 60_000 });
    expect((await store.getWorkspaces()).workspaces).toEqual([]);
  });

  it('throws when writer is not provided', async () => {
    const reader = fakeReader({ '/config/workspaces.json': { workspaces: [] } });
    const store = createConfigStore({ reader }); // no writer
    await expect(store.putWorkspaces({ workspaces: [] })).rejects.toThrow('writer not provided');
  });

  it('putGroupRoleMap writes and invalidates cache', async () => {
    const written: Record<string, string> = {};
    const reader = fakeReader({});
    const writer = jest.fn(async (path: string, body: string) => { written[path] = body; });
    const store = createConfigStore({ reader, writer, ttlMs: 60_000 });
    await store.putGroupRoleMap({ entries: [] });
    expect(writer).toHaveBeenCalledWith('/config/group-role-map.json', expect.any(String));
  });

  it('putAppSettings writes and invalidates cache', async () => {
    const reader = fakeReader({});
    const writer = jest.fn(async () => { /* no-op */ });
    const store = createConfigStore({ reader, writer, ttlMs: 60_000 });
    await store.putAppSettings({ brandName: 'X', welcomePitch: 'Y', defaultTheme: 'dark' });
    expect(writer).toHaveBeenCalledWith('/config/app-settings.json', expect.any(String));
  });
});
