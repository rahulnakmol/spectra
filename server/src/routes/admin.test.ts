import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { adminRouter } from './admin.js';
import { errorMiddleware } from '../errors/middleware.js';
import type { SessionClaims, WorkspaceConfig, GroupRoleMapEntry } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

const admin: SessionClaims = {
  sessionId: 'S', userOid: '00000000-0000-0000-0000-000000000010', tenantId: 'T', isAdmin: true,
  teamMemberships: [], issuedAt: 0, expiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
  absoluteExpiresAt: 9_999_999_999_999,
};
const member: SessionClaims = { ...admin, isAdmin: false };

function makeStore(initial: WorkspaceConfig[] = [], map: GroupRoleMapEntry[] = []): ConfigStore {
  let workspaces = [...initial];
  let entries = [...map];
  return {
    getWorkspaces: jest.fn(async () => ({ workspaces })),
    getGroupRoleMap: jest.fn(async () => ({ entries })),
    getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(async (v: { workspaces: WorkspaceConfig[] }) => { workspaces = v.workspaces; }),
    putGroupRoleMap: jest.fn(async (v: { entries: GroupRoleMapEntry[] }) => { entries = v.entries; }),
    putAppSettings: jest.fn(),
    invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

function makeApp(session: SessionClaims, store: ConfigStore) {
  const app = express();
  app.use(express.json());
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  app.use(adminRouter({ store, provisionContainer: jest.fn(async () => 'NEW-CONTAINER-ID'), auditQuery: jest.fn(async () => ({ events: [] })) }));
  app.use(errorMiddleware);
  return app;
}

describe('admin routes', () => {
  it('all routes 403 for non-admin', async () => {
    const r = await request(makeApp(member, makeStore())).get('/api/admin/workspaces');
    expect(r.status).toBe(403);
  });

  it('GET /api/admin/workspaces lists all (incl archived)', async () => {
    const store = makeStore([
      { id: 'a', displayName: 'A', template: 'invoices', containerId: 'C', folderConvention: ['YYYY'], metadataSchema: [], archived: false, createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
      { id: 'b', displayName: 'B', template: 'blank', containerId: 'C2', folderConvention: ['YYYY'], metadataSchema: [], archived: true, createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
    ]);
    const r = await request(makeApp(admin, store)).get('/api/admin/workspaces');
    expect(r.body.workspaces).toHaveLength(2);
  });

  it('POST /api/admin/workspaces creates from template', async () => {
    const store = makeStore();
    const r = await request(makeApp(admin, store))
      .post('/api/admin/workspaces')
      .send({ id: 'invoices-2', displayName: 'AP-2', template: 'invoices' });
    expect(r.status).toBe(201);
    expect(r.body.workspace.id).toBe('invoices-2');
    expect(r.body.workspace.containerId).toBe('NEW-CONTAINER-ID');
    expect(r.body.workspace.metadataSchema.length).toBeGreaterThan(0);
  });

  it('PATCH /api/admin/workspaces/:ws archives', async () => {
    const store = makeStore([
      { id: 'a', displayName: 'A', template: 'invoices', containerId: 'C', folderConvention: ['YYYY'], metadataSchema: [], archived: false, createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
    ]);
    const r = await request(makeApp(admin, store)).patch('/api/admin/workspaces/a').send({ archived: true });
    expect(r.status).toBe(200);
    expect(r.body.workspace.archived).toBe(true);
  });

  it('GET /api/admin/group-mapping returns entries', async () => {
    const r = await request(makeApp(admin, makeStore())).get('/api/admin/group-mapping');
    expect(r.status).toBe(200);
    expect(r.body.entries).toEqual([]);
  });

  it('PUT /api/admin/group-mapping replaces entries', async () => {
    const store = makeStore();
    const entry = {
      entraGroupId: '11111111-1111-1111-1111-111111111111',
      entraGroupDisplayName: 'Finance',
      workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team',
    };
    const r = await request(makeApp(admin, store))
      .put('/api/admin/group-mapping').send({ entries: [entry] });
    expect(r.status).toBe(200);
    expect(r.body.entries).toEqual([entry]);
  });

  it('GET /api/admin/audit returns canned KQL events', async () => {
    const r = await request(makeApp(admin, makeStore())).get('/api/admin/audit?action=files.upload&limit=10');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.events)).toBe(true);
  });
});
