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
});
