import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { workspacesRouter } from './workspaces.js';
import { errorMiddleware } from '../errors/middleware.js';
import type { SessionClaims } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';

function makeStore(): ConfigStore {
  return {
    getWorkspaces: jest.fn(async () => ({
      workspaces: [
        { id: 'invoices', displayName: 'Invoices', template: 'invoices', containerId: 'D1',
          folderConvention: ['Team', 'YYYY', 'MM'], metadataSchema: [], archived: false,
          createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
        { id: 'contracts', displayName: 'Contracts', template: 'contracts', containerId: 'D2',
          folderConvention: ['Counterparty', 'YYYY'], metadataSchema: [], archived: false,
          createdAt: '2026-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
        { id: 'old', displayName: 'Old', template: 'blank', containerId: 'D3',
          folderConvention: ['YYYY'], metadataSchema: [], archived: true,
          createdAt: '2025-01-01T00:00:00Z', createdByOid: '00000000-0000-0000-0000-000000000000' },
      ],
    })),
    getGroupRoleMap: jest.fn(async () => ({ entries: [
      { entraGroupId: '00000000-0000-0000-0000-000000000001', entraGroupDisplayName: 'AP', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
    ] })),
    getAppSettings: jest.fn(),
    putWorkspaces: jest.fn(), putGroupRoleMap: jest.fn(), putAppSettings: jest.fn(), invalidate: jest.fn(),
  } as unknown as ConfigStore;
}

const member: SessionClaims = {
  sessionId: 'S', userOid: 'O', tenantId: 'T', isAdmin: false,
  teamMemberships: [{ workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' }],
  issuedAt: 0, expiresAt: 9_999_999_999_999, absoluteExpiresAt: 9_999_999_999_999, lastSlidingUpdate: 0,
  userAccessToken: 'AT',
};
const admin: SessionClaims = { ...member, isAdmin: true, teamMemberships: [] };

function makeApp(session: SessionClaims) {
  const app = express();
  app.use((req, _r, n) => { (req as unknown as { session: SessionClaims }).session = session; n(); });
  app.use(workspacesRouter({ store: makeStore() }));
  app.use(errorMiddleware);
  return app;
}

describe('workspaces routes', () => {
  it('GET /api/workspaces returns only workspaces user can access (member)', async () => {
    const r = await request(makeApp(member)).get('/api/workspaces');
    expect(r.status).toBe(200);
    expect(r.body.workspaces.map((w: { id: string }) => w.id)).toEqual(['invoices']);
  });

  it('GET /api/workspaces returns all non-archived for admin', async () => {
    const r = await request(makeApp(admin)).get('/api/workspaces');
    expect(r.body.workspaces.map((w: { id: string }) => w.id)).toEqual(['invoices', 'contracts']);
  });

  it('GET /api/workspaces/:ws/teams returns user teams in workspace', async () => {
    const r = await request(makeApp(member)).get('/api/workspaces/invoices/teams');
    expect(r.status).toBe(200);
    expect(r.body.teams).toEqual([{ teamCode: 'AP', teamDisplayName: 'AP Team' }]);
  });

  it('GET /api/workspaces/:ws/teams 403 if no access', async () => {
    const r = await request(makeApp(member)).get('/api/workspaces/contracts/teams');
    expect(r.status).toBe(403);
  });

  it('GET /api/workspaces propagates store errors as 500', async () => {
    const store = makeStore();
    (store.getWorkspaces as jest.MockedFunction<() => Promise<unknown>>).mockRejectedValue(new Error('DB down'));
    const app = express();
    app.use((req, _r, n) => { (req as unknown as { session: typeof member }).session = member; n(); });
    app.use(workspacesRouter({ store }));
    app.use(errorMiddleware);
    const r = await request(app).get('/api/workspaces');
    expect(r.status).toBe(500);
  });

  it('GET /api/workspaces/:ws/teams — admin sees all teams for workspace including non-member ones', async () => {
    const r = await request(makeApp(admin)).get('/api/workspaces/invoices/teams');
    expect(r.status).toBe(200);
    // Admin has no direct memberships but should see the mapped team from getGroupRoleMap
    expect(r.body.teams.some((t: { teamCode: string }) => t.teamCode === 'AP')).toBe(true);
  });

  it('GET /api/workspaces/:ws/teams — admin deduplicates entries for same teamCode', async () => {
    const store = makeStore();
    (store.getGroupRoleMap as jest.MockedFunction<() => Promise<unknown>>).mockResolvedValue({
      entries: [
        { entraGroupId: 'G1', entraGroupDisplayName: 'G1', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
        { entraGroupId: 'G2', entraGroupDisplayName: 'G2', workspaceId: 'invoices', teamCode: 'AP', teamDisplayName: 'AP Team' },
      ],
    });
    const app = express();
    app.use((req, _r, n) => { (req as unknown as { session: typeof admin }).session = admin; n(); });
    app.use(workspacesRouter({ store }));
    app.use(errorMiddleware);
    const r = await request(app).get('/api/workspaces/invoices/teams');
    expect(r.status).toBe(200);
    // Should be deduplicated to 1 entry
    expect(r.body.teams.filter((t: { teamCode: string }) => t.teamCode === 'AP')).toHaveLength(1);
  });

  it('GET /api/workspaces/:ws/teams — member with empty teams for that workspace throws 403', async () => {
    // member has no membership in 'contracts', requireWorkspaceAccess returns 403 first
    const r = await request(makeApp(member)).get('/api/workspaces/contracts/teams');
    expect(r.status).toBe(403);
  });
});
